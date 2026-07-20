import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { deliverMessage, setHttpFetch } from '../src/modules/outbound/index.js';
import { createMessage } from '../src/modules/messages/service.js';
import { closeExpiredDone } from '../src/jobs/maintenance.js';
import { resetLoginRateLimiter } from '../src/modules/auth/routes.js';
import { encryptJson } from '../src/lib/crypto.js';
import {
  closeApp,
  createChannel,
  createEndUser,
  createTicket,
  createUser,
  getApp,
  login,
  resetDb,
  seedBasics,
} from './helpers.js';

afterAll(async () => {
  await closeApp();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  resetLoginRateLimiter();
});

// ---------------------------------------------------------------------------
// P0-1 outbound delivery
// ---------------------------------------------------------------------------

describe('P0-1 — outbound delivery', () => {
  it('livechat replies are marked sent and readable via the widget thread poll', async () => {
    const app = await getApp();
    const { tenant, agentA } = await seedBasics();
    const channel = await createChannel(tenant.id, 'livechat');
    const endUser = await prisma.endUser.create({
      data: { tenantId: tenant.id, externalKey: 'lc:sess-1', displayName: 'Visitor' },
    });
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'handoff',
    });

    const cookie = await login(app, agentA.email);
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant.slug}/tickets/${ticket.id}/messages`,
      headers: { cookie },
      payload: { body: '您好，已为您核实。' },
    });
    expect(res.statusCode).toBe(201);

    const msg = await prisma.message.findFirstOrThrow({
      where: { ticketId: ticket.id, senderType: 'agent' },
    });
    expect(msg.deliveryStatus).toBe('sent');
    expect(msg.deliveredAt).not.toBeNull();

    // Widget poll (public, keyed by channel + sessionKey) sees the reply.
    const poll = await app.inject({
      method: 'GET',
      url: `/webhooks/livechat/${channel.id}/thread?sessionKey=sess-1`,
    });
    expect(poll.statusCode).toBe(200);
    const thread = poll.json() as { ticketId: string; messages: Array<{ senderType: string; body: string }> };
    expect(thread.ticketId).toBe(ticket.id);
    expect(thread.messages.some((m) => m.senderType === 'agent' && m.body.includes('已为您核实'))).toBe(true);
  });

  it('telegram delivery succeeds through the bot API and records failure without a token', async () => {
    const { tenant, agentA } = await seedBasics('tg-t');
    // Channel WITH a bot token: mock the Telegram API.
    const configured = await prisma.channel.create({
      data: {
        tenantId: tenant.id,
        type: 'telegram',
        status: 'active',
        configEncrypted: encryptJson({ botToken: 'TEST_TOKEN' }) as object,
      },
    });
    const endUser = await prisma.endUser.create({
      data: { tenantId: tenant.id, externalKey: 'tg:1', displayName: 'TG', telegramId: '424242' },
    });
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: configured.id,
      endUserId: endUser.id,
      status: 'human',
    });

    const calls: Array<{ url: string; body: unknown }> = [];
    setHttpFetch((async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch);

    const sent = await createMessage({
      tenantId: tenant.id,
      ticketId: ticket.id,
      senderType: 'agent',
      senderUserId: agentA.id,
      body: 'hello from console',
    });
    expect(sent.deliveryStatus).toBe('sent');
    expect(calls[0]!.url).toContain('api.telegram.org/botTEST_TOKEN/sendMessage');
    expect((calls[0]!.body as { chat_id: string }).chat_id).toBe('424242');

    // Channel WITHOUT a token: honest terminal failure, visible to the console.
    setHttpFetch(fetch);
    const bare = await createChannel(tenant.id, 'telegram');
    const t2 = await createTicket({
      tenantId: tenant.id,
      channelId: bare.id,
      endUserId: endUser.id,
      status: 'human',
    });
    const failed = await createMessage({
      tenantId: tenant.id,
      ticketId: t2.id,
      senderType: 'eva',
      body: 'no token',
    });
    expect(failed.deliveryStatus).toBe('failed');
    expect(failed.deliveryError).toContain('telegram_bot_token_not_configured');
  });

  it('internal notes are never delivered and never appear in the end-user thread', async () => {
    const app = await getApp();
    const { tenant, agentA } = await seedBasics('int-t');
    const channel = await createChannel(tenant.id, 'livechat');
    const endUser = await prisma.endUser.create({
      data: { tenantId: tenant.id, externalKey: 'lc:sess-9', displayName: 'V' },
    });
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'human',
    });

    const cookie = await login(app, agentA.email);
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant.slug}/tickets/${ticket.id}/messages`,
      headers: { cookie },
      payload: { body: '内部备注：客户是 VIP', internal: true },
    });
    expect(res.statusCode).toBe(201);

    const note = await prisma.message.findFirstOrThrow({ where: { ticketId: ticket.id } });
    expect(note.deliveryStatus).toBe('not_applicable');

    const poll = await app.inject({
      method: 'GET',
      url: `/webhooks/livechat/${channel.id}/thread?sessionKey=sess-9`,
    });
    const thread = poll.json() as { messages: Array<{ body: string }> };
    expect(thread.messages.every((m) => !m.body.includes('内部备注'))).toBe(true);

    // Internal note did not touch lock/status.
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.status).toBe('human');
    expect(after.lockedByUserId).toBeNull();
  });

  it('failed deliveries can be retried via the console endpoint', async () => {
    const app = await getApp();
    const { tenant, agentA } = await seedBasics('rt-t');
    const channel = await prisma.channel.create({
      data: {
        tenantId: tenant.id,
        type: 'telegram',
        status: 'active',
        configEncrypted: encryptJson({ botToken: 'T2' }) as object,
      },
    });
    const endUser = await prisma.endUser.create({
      data: { tenantId: tenant.id, externalKey: 'tg:2', displayName: 'TG2', telegramId: '777' },
    });
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'human',
    });

    // First attempt: Telegram 500s (retryable failure).
    setHttpFetch((async () => new Response('boom', { status: 500 })) as typeof fetch);
    const msg = await createMessage({
      tenantId: tenant.id,
      ticketId: ticket.id,
      senderType: 'agent',
      senderUserId: agentA.id,
      body: 'retry me',
    });
    expect(msg.deliveryStatus).toBe('pending'); // retryable, attempts < cap

    // Now the API recovers; manual retry succeeds.
    setHttpFetch((async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch);
    const cookie = await login(app, agentA.email);
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant.slug}/tickets/${ticket.id}/messages/${msg.id}/retry-delivery`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
    const after = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(after.deliveryStatus).toBe('sent');
    setHttpFetch(fetch);
  });
});

// ---------------------------------------------------------------------------
// P0-2 inbox operability
// ---------------------------------------------------------------------------

describe('P0-2 — inbox operability', () => {
  it('default list = active queue only; done/closed have their own filters; search hits message bodies and #number', async () => {
    const app = await getApp();
    const { tenant, channel, endUser, agentA } = await seedBasics('inb-t');

    const active = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      subject: 'active one',
      status: 'handoff',
    });
    await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      subject: 'closed noise',
      status: 'closed',
    });
    await createMessage({
      tenantId: tenant.id,
      ticketId: active.id,
      senderType: 'end_user',
      body: '我的充值没有到账',
    });

    const cookie = await login(app, agentA.email);
    const list = await app.inject({
      method: 'GET',
      url: `/tenants/${tenant.slug}/tickets`,
      headers: { cookie },
    });
    const body = list.json() as { tickets: Array<{ subject: string; number: number }> };
    expect(body.tickets.some((t) => t.subject === 'closed noise')).toBe(false);
    expect(body.tickets.some((t) => t.subject === 'active one')).toBe(true);

    const closed = await app.inject({
      method: 'GET',
      url: `/tenants/${tenant.slug}/tickets?status=closed`,
      headers: { cookie },
    });
    expect((closed.json() as { tickets: unknown[] }).tickets.length).toBe(1);

    // Message-content search (review B-12).
    const byContent = await app.inject({
      method: 'GET',
      url: `/tenants/${tenant.slug}/tickets?q=${encodeURIComponent('充值')}`,
      headers: { cookie },
    });
    expect((byContent.json() as { tickets: Array<{ id: string }> }).tickets[0]?.id).toBe(active.id);

    // #number search (review B-22).
    const activeRow = await prisma.ticket.findUniqueOrThrow({ where: { id: active.id } });
    const byNumber = await app.inject({
      method: 'GET',
      url: `/tenants/${tenant.slug}/tickets?q=${encodeURIComponent(`#${activeRow.number}`)}`,
      headers: { cookie },
    });
    expect((byNumber.json() as { tickets: Array<{ id: string }> }).tickets[0]?.id).toBe(active.id);
  });

  it('replying to an ai ticket takes it over in one step (ai→handoff→human, audited)', async () => {
    const app = await getApp();
    const { tenant, channel, endUser, agentA } = await seedBasics('tak-t');
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'ai',
    });

    const cookie = await login(app, agentA.email);
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant.slug}/tickets/${ticket.id}/messages`,
      headers: { cookie },
      payload: { body: '我来接管' },
    });
    expect(res.statusCode).toBe(201);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.status).toBe('human');
    expect(after.lockedByUserId).toBe(agentA.id);

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual(['handoff', 'claim']);
  });

  it('bulk done→closed no longer floods the inbox: updated_at is preserved (review B-01)', async () => {
    const { tenant, channel, endUser } = await seedBasics('cron-t');
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const t = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'done',
      resolvedAt: old,
    });
    await prisma.$executeRaw`UPDATE tickets SET updated_at = ${old} WHERE id = ${t.id}::uuid`;

    const closed = await closeExpiredDone();
    expect(closed).toBe(1);
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.status).toBe('closed');
    expect(Math.abs(after.updatedAt.getTime() - old.getTime())).toBeLessThan(2000);
  });

  it('end-user profile endpoint returns cross-ticket history (P0-3)', async () => {
    const app = await getApp();
    const { tenant, channel, endUser, agentA } = await seedBasics('prof-t');
    await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      subject: 'first',
      status: 'done',
    });
    await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      subject: 'second',
      status: 'handoff',
    });

    const cookie = await login(app, agentA.email);
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${tenant.slug}/end-users/${endUser.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      endUser: { id: string };
      tickets: Array<{ subject: string }>;
      stats: Record<string, number>;
    };
    expect(body.endUser.id).toBe(endUser.id);
    expect(body.tickets.length).toBe(2);
    expect(body.stats.done).toBe(1);

    // Cross-tenant: an end user from another tenant is invisible.
    const other = await createEndUser((await prisma.tenant.create({ data: { slug: 'x2', name: 'x2' } })).id);
    const forbidden = await app.inject({
      method: 'GET',
      url: `/tenants/${tenant.slug}/end-users/${other.id}`,
      headers: { cookie },
    });
    expect(forbidden.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// P0-5 users & security baseline
// ---------------------------------------------------------------------------

describe('P0-5 — user management + login protection', () => {
  it('tenant_admin can create/update/deactivate users; agents cannot; deactivated users are locked out', async () => {
    const app = await getApp();
    const { tenant, agentA, admin } = await seedBasics('usr-t');
    const adminCookie = await login(app, admin.email);
    const agentCookie = await login(app, agentA.email);

    // Agent is refused.
    const denied = await app.inject({
      method: 'GET',
      url: `/tenants/${tenant.slug}/users`,
      headers: { cookie: agentCookie },
    });
    expect(denied.statusCode).toBe(403);

    // Admin creates a new agent.
    const created = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant.slug}/users`,
      headers: { cookie: adminCookie },
      payload: { email: 'newbie@usr-t.example', displayName: '新客服', role: 'agent', password: 'password123' },
    });
    expect(created.statusCode).toBe(201);
    const newbie = (created.json() as { user: { id: string } }).user;

    // The new user can log in.
    const newbieCookie = await login(app, 'newbie@usr-t.example');
    expect(newbieCookie).toContain('=');

    // Deactivate → session is dead and re-login refused.
    const off = await app.inject({
      method: 'PUT',
      url: `/tenants/${tenant.slug}/users/${newbie.id}`,
      headers: { cookie: adminCookie },
      payload: { isActive: false },
    });
    expect(off.statusCode).toBe(200);
    const meAfter = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: newbieCookie } });
    expect(meAfter.statusCode).toBe(401);
    const relogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'newbie@usr-t.example', password: 'password123' },
    });
    expect(relogin.statusCode).toBe(401);

    // Admin cannot deactivate their own account.
    const self = await app.inject({
      method: 'PUT',
      url: `/tenants/${tenant.slug}/users/${admin.id}`,
      headers: { cookie: adminCookie },
      payload: { isActive: false },
    });
    expect(self.statusCode).toBe(400);
  });

  it('5 failed logins trigger a 429 cooldown (review B-15)', async () => {
    const app = await getApp();
    await seedBasics('rl-t');
    const email = 'user1@example.com';

    let last = 0;
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: `wrong-${i}` },
      });
      last = res.statusCode;
    }
    expect(last).toBe(401);
    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'password123' },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('self-service password change works and requires the current password', async () => {
    const app = await getApp();
    const { agentA } = await seedBasics('pw-t');
    const cookie = await login(app, agentA.email);

    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: 'nope', newPassword: 'brand-new-pass-1' },
    });
    expect(wrong.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: 'password123', newPassword: 'brand-new-pass-1' },
    });
    expect(ok.statusCode).toBe(200);
    await login(app, agentA.email, 'brand-new-pass-1');
  });
});

// ---------------------------------------------------------------------------
// P0-8 real AI-layer health
// ---------------------------------------------------------------------------

describe('P0-8 — eva-config exposes real layer availability and env costs', () => {
  it('reports L2/L3 unavailable (with reasons) when credentials are missing', async () => {
    const app = await getApp();
    const { tenant, agentA } = await seedBasics('hl-t');
    const cookie = await login(app, agentA.email);
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${tenant.slug}/eva-config`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      availability: { l1: { available: boolean }; l2: { available: boolean; reason?: string }; l3: { available: boolean } };
      costs: { l1: number; l2: number; l3: number };
    };
    expect(body.availability.l1.available).toBe(true);
    // Test env has no L2_BASE_URL / ANTHROPIC_API_KEY.
    expect(body.availability.l2.available).toBe(false);
    expect(body.availability.l2.reason).toBeTruthy();
    expect(body.availability.l3.available).toBe(false);
    expect(typeof body.costs.l3).toBe('number');
  });
});
