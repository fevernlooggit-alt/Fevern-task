import { describe, it, expect } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { getApp, login, seedBasics, createTicket } from './helpers.js';
import { decryptJson, isEncryptedBlob } from '../src/lib/crypto.js';

async function ctx(slug: string) {
  const basics = await seedBasics(slug);
  const app = await getApp();
  const admin = await login(app, basics.admin.email);
  const agent = await login(app, basics.agentA.email);
  return { ...basics, app, admin, agent };
}

describe('eva-config route', () => {
  it('GET returns config; PUT (admin) updates; agent is forbidden to PUT', async () => {
    const c = await ctx('e1');
    const get = await c.app.inject({ method: 'GET', url: `/tenants/${c.tenant.slug}/eva-config`, headers: { cookie: c.agent } });
    expect(get.statusCode).toBe(200);

    const put = await c.app.inject({ method: 'PUT', url: `/tenants/${c.tenant.slug}/eva-config`, headers: { cookie: c.admin }, payload: { handoffConfidenceThreshold: 80, l2Enabled: false } });
    expect(put.statusCode).toBe(200);
    expect(put.json().config.handoffConfidenceThreshold).toBe(80);

    const forbidden = await c.app.inject({ method: 'PUT', url: `/tenants/${c.tenant.slug}/eva-config`, headers: { cookie: c.agent }, payload: { signature: 'x' } });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe('label-answers CRUD', () => {
  it('create / update / delete', async () => {
    const c = await ctx('la1');
    const created = await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/label-answers`, headers: { cookie: c.admin }, payload: { triggerKeywords: ['提现'], locale: 'zh', answerBody: '提现说明' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().labelAnswer.id;

    const updated = await c.app.inject({ method: 'PUT', url: `/tenants/${c.tenant.slug}/label-answers/${id}`, headers: { cookie: c.admin }, payload: { isActive: false } });
    expect(updated.json().labelAnswer.isActive).toBe(false);

    const deleted = await c.app.inject({ method: 'DELETE', url: `/tenants/${c.tenant.slug}/label-answers/${id}`, headers: { cookie: c.admin } });
    expect(deleted.statusCode).toBe(200);
    expect(await prisma.labelAnswer.count({ where: { tenantId: c.tenant.id } })).toBe(0);
  });
});

describe('kb-articles CRUD + EVA exclusion', () => {
  it('non-synced articles are flagged excluded and excluded from EVA retrieval', async () => {
    const c = await ctx('kb1');
    await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/kb-articles`, headers: { cookie: c.admin }, payload: { title: '夺宝规则', bodyMd: '夺宝道具发放时效说明', locale: 'zh', tags: ['夺宝'], syncStatus: 'synced' } });
    await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/kb-articles`, headers: { cookie: c.admin }, payload: { title: '草稿文章', bodyMd: '夺宝内部草稿', locale: 'zh', tags: ['夺宝'], syncStatus: 'pending_confirmation' } });

    const list = await c.app.inject({ method: 'GET', url: `/tenants/${c.tenant.slug}/kb-articles?q=夺宝`, headers: { cookie: c.agent } });
    const items = list.json().kbArticles as Array<{ title: string; excludedFromEva: boolean }>;
    expect(items.find((a) => a.title === '草稿文章')!.excludedFromEva).toBe(true);
    expect(items.find((a) => a.title === '夺宝规则')!.excludedFromEva).toBe(false);

    const { retrieveKb } = await import('../src/modules/eva/retrieval.js');
    const snippets = await retrieveKb(c.tenant.id, '夺宝');
    expect(snippets.some((s) => s.title === '草稿文章')).toBe(false);
    expect(snippets.some((s) => s.title === '夺宝规则')).toBe(true);
  });
});

describe('channels CRUD — encryption + redaction', () => {
  it('stores config encrypted, never returns secrets, decrypts internally', async () => {
    const c = await ctx('ch1');
    const created = await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/channels`, headers: { cookie: c.admin }, payload: { type: 'email', config: { host: 'imap.example.com', user: 'a@b.c', pass: 'super-secret' } } });
    expect(created.statusCode).toBe(201);
    const body = created.json().channel;
    expect(body.configured).toBe(true);
    // No secret in the API response.
    expect(JSON.stringify(body)).not.toContain('super-secret');

    const row = await prisma.channel.findUniqueOrThrow({ where: { id: body.id } });
    expect(isEncryptedBlob(row.configEncrypted)).toBe(true);
    const decrypted = decryptJson<{ pass: string }>(row.configEncrypted as never);
    expect(decrypted.pass).toBe('super-secret');
  });
});

describe('metrics routes', () => {
  it('summary / routing / timeseries return shapes', async () => {
    const c = await ctx('mx1');
    await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'new' });

    const s = await c.app.inject({ method: 'GET', url: `/tenants/${c.tenant.slug}/metrics/summary`, headers: { cookie: c.agent } });
    expect(s.statusCode).toBe(200);
    expect(s.json()).toHaveProperty('aiResolutionRate');
    expect(s.json()).toHaveProperty('agents');

    const r = await c.app.inject({ method: 'GET', url: `/tenants/${c.tenant.slug}/metrics/routing`, headers: { cookie: c.agent } });
    expect(r.json().distribution).toHaveProperty('l1');

    const ts = await c.app.inject({ method: 'GET', url: `/tenants/${c.tenant.slug}/metrics/timeseries`, headers: { cookie: c.agent } });
    expect(ts.json().series).toHaveLength(14);
  });
});

describe('telegram webhook', () => {
  it('creates a ticket + end_user message from an inbound update', async () => {
    const c = await ctx('tg1');
    const channel = await prisma.channel.create({ data: { tenantId: c.tenant.id, type: 'telegram', status: 'active' } });
    await prisma.evaConfig.create({ data: { tenantId: c.tenant.id, l2Enabled: false, l3Enabled: false } });

    const res = await c.app.inject({
      method: 'POST',
      url: `/webhooks/telegram/${channel.id}`,
      payload: { message: { message_id: 555, text: '你好，我要咨询夺宝', from: { id: 9001, first_name: 'Tg', username: 'tguser' } } },
    });
    expect(res.statusCode).toBe(200);
    const created = res.json();
    expect(created.ok).toBe(true);

    const eu = await prisma.endUser.findFirst({ where: { tenantId: c.tenant.id, externalKey: 'tg:9001' } });
    expect(eu).toBeTruthy();
    const msgs = await prisma.message.findMany({ where: { ticketId: created.ticketId, senderType: 'end_user' } });
    expect(msgs).toHaveLength(1);
  });

  it('serves the minimal livechat widget script', async () => {
    const c = await ctx('w1');
    const channel = await prisma.channel.create({ data: { tenantId: c.tenant.id, type: 'livechat', status: 'active' } });
    const res = await c.app.inject({ method: 'GET', url: `/widget/${channel.id}.js` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.body).toContain('iCRM');
  });
});

describe('lock heartbeat + release routes', () => {
  it('heartbeat refreshes the lock; release drops it', async () => {
    const c = await ctx('hb1');
    const ticket = await createTicket({ tenantId: c.tenant.id, channelId: c.channel.id, endUserId: c.endUser.id, status: 'handoff' });
    await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/claim`, headers: { cookie: c.agent } });

    const hb = await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/heartbeat`, headers: { cookie: c.agent } });
    expect(hb.json().ok).toBe(true);

    const rel = await c.app.inject({ method: 'POST', url: `/tenants/${c.tenant.slug}/tickets/${ticket.id}/release`, headers: { cookie: c.agent } });
    expect(rel.json().released).toBe(true);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).lockedByUserId).toBeNull();
  });
});
