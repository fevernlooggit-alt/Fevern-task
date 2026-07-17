import { describe, it, expect } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { getApp, login, seedBasics, createTicket } from './helpers.js';

async function ctx(slug: string) {
  const basics = await seedBasics(slug);
  const app = await getApp();
  const cookieA = await login(app, basics.agentA.email);
  const cookieB = await login(app, basics.agentB.email);
  return { ...basics, app, cookieA, cookieB };
}

describe('ticket API flows', () => {
  it('agent reply on a handoff ticket auto-claims → human and posts the message', async () => {
    const c = await ctx('t1');
    const ticket = await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'handoff' });

    const res = await c.app.inject({
      method: 'POST',
      url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/messages`,
      headers: { cookie: c.cookieA },
      payload: { body: '您好，我是人工客服，正在为您核查。' },
    });
    expect(res.statusCode).toBe(201);

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.status).toBe('human');
    expect(row.lockedByUserId).toBe(c.agentA.id);
    expect(row.firstResponseAt).not.toBeNull();

    const msgs = await prisma.message.findMany({ where: { ticketId: ticket.id } });
    expect(msgs.some((m) => m.senderType === 'agent')).toBe(true);
  });

  it('a second agent cannot reply to a ticket locked by the first (409)', async () => {
    const c = await ctx('t2');
    const ticket = await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'human', lockedByUserId: c.agentA.id, lockedAt: new Date(), assigneeUserId: c.agentA.id });

    const res = await c.app.inject({
      method: 'POST',
      url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/messages`,
      headers: { cookie: c.cookieB },
      payload: { body: 'let me jump in' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details.holder.id).toBe(c.agentA.id);
  });

  it('resolve moves human → done, unlocks, and sets resolvedAt', async () => {
    const c = await ctx('t3');
    const ticket = await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'human', lockedByUserId: c.agentA.id, lockedAt: new Date(), assigneeUserId: c.agentA.id });

    const res = await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/resolve`, headers: { cookie: c.cookieA } });
    expect(res.statusCode).toBe(200);

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.status).toBe('done');
    expect(row.resolvedAt).not.toBeNull();
    expect(row.lockedByUserId).toBeNull();
  });

  it('illegal transition (resolve a new ticket) returns 422', async () => {
    const c = await ctx('t4');
    const ticket = await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'new' });
    const res = await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/resolve`, headers: { cookie: c.cookieA } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('illegal_transition');
  });

  it('every successful transition writes an append-only ticket_events row', async () => {
    const c = await ctx('t5');
    const ticket = await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'handoff' });
    await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/claim`, headers: { cookie: c.cookieA } });
    await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/resolve`, headers: { cookie: c.cookieA } });

    const events = await prisma.ticketEvent.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: 'asc' } });
    const types = events.map((e) => `${e.fromStatus}->${e.toStatus}`);
    expect(types).toContain('handoff->human');
    expect(types).toContain('human->done');
  });

  it('reopen within 7 days: done → human; after closed: creates a NEW linked ticket', async () => {
    const c = await ctx('t6');
    // done → human
    const done = await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'done', resolvedAt: new Date() });
    const r1 = await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${done.id}/reopen`, headers: { cookie: c.cookieA } });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().createdNew).toBe(false);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: done.id } })).status).toBe('human');

    // closed → new linked ticket
    const closed = await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'closed', resolvedAt: new Date(Date.now() - 8 * 864e5) });
    const r2 = await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${closed.id}/reopen`, headers: { cookie: c.cookieA } });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().createdNew).toBe(true);
    const fresh = r2.json().ticket;
    expect(fresh.status).toBe('new');
    expect(fresh.meta.reopenedFrom).toBe(closed.id);
  });

  it('list filters by status and reports the new+handoff badge count', async () => {
    const c = await ctx('t7');
    await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'new' });
    await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'handoff' });
    await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'ai' });

    const res = await c.app.inject({ method: 'GET', url: `/tenants/${c.tenant.slug}/tickets?status=handoff`, headers: { cookie: c.cookieA } });
    const body = res.json();
    expect(body.tickets.every((t: { status: string }) => t.status === 'handoff')).toBe(true);
    expect(body.badgeCount).toBe(2); // new + handoff
  });
});
