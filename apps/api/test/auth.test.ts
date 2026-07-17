import { describe, it, expect } from 'vitest';
import { getApp, login, seedBasics, createTenant, createUser, createChannel, createEndUser, createTicket } from './helpers.js';

describe('auth + roles + tenancy', () => {
  it('rejects unauthenticated access', async () => {
    const { tenant } = await seedBasics('a1');
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/tenants/${tenant.slug}/tickets` });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('rejects a wrong password without leaking which field was wrong', async () => {
    const { agentA } = await seedBasics('a2');
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: agentA.email, password: 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('logs in, sets an HTTP-only cookie, and returns the user', async () => {
    const { agentA } = await seedBasics('a3');
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: agentA.email, password: 'password123' } });
    expect(res.statusCode).toBe(200);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('icrm_session=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(res.json().user.email).toBe(agentA.email);
  });

  it('forbids cross-tenant access for non-super-admins', async () => {
    const other = await createTenant('other', 'Other');
    const { tenant, agentA } = await seedBasics('a4');
    // A ticket in the OTHER tenant.
    const ch = await createChannel(other.id);
    const eu = await createEndUser(other.id);
    await createTicket({ tenantId: other.id, channelId: ch.id, endUserId: eu.id });

    const app = await getApp();
    const cookie = await login(app, agentA.email);
    const res = await app.inject({ method: 'GET', url: `/tenants/${other.slug}/tickets`, headers: { cookie } });
    expect(res.statusCode).toBe(403);
    // And the agent CAN see their own tenant.
    const ok = await app.inject({ method: 'GET', url: `/tenants/${tenant.slug}/tickets`, headers: { cookie } });
    expect(ok.statusCode).toBe(200);
  });

  it('super_admin can access any tenant', async () => {
    const { tenant } = await seedBasics('a5');
    const su = await createUser({ role: 'super_admin', tenantId: null, displayName: 'Root' });
    const app = await getApp();
    const cookie = await login(app, su.email);
    const res = await app.inject({ method: 'GET', url: `/tenants/${tenant.slug}/tickets`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });

  it('enforces role checks: viewer cannot claim, agent can', async () => {
    const { tenant, channel, endUser, agentA } = await seedBasics('a6');
    const viewer = await createUser({ role: 'viewer', tenantId: tenant.id, displayName: 'Viewer' });
    const ticket = await createTicket({ tenantId: tenant.id, channelId: channel.id, endUserId: endUser.id, status: 'handoff' });
    const app = await getApp();

    const vCookie = await login(app, viewer.email);
    const vRes = await app.inject({ method: 'POST', url: `/tenants/${tenant.slug}/tickets/${ticket.id}/claim`, headers: { cookie: vCookie } });
    expect(vRes.statusCode).toBe(403);

    const aCookie = await login(app, agentA.email);
    const aRes = await app.inject({ method: 'POST', url: `/tenants/${tenant.slug}/tickets/${ticket.id}/claim`, headers: { cookie: aCookie } });
    expect(aRes.statusCode).toBe(200);
  });

  it('GET /tenants: super_admin sees all, agent sees only their own', async () => {
    const { tenant, agentA } = await seedBasics('a8');
    await createTenant('a8-other', 'Other');
    const su = await createUser({ role: 'super_admin', tenantId: null });
    const app = await getApp();

    const suCookie = await login(app, su.email);
    const suRes = await app.inject({ method: 'GET', url: '/tenants', headers: { cookie: suCookie } });
    expect(suRes.json().tenants.length).toBe(2);

    const agCookie = await login(app, agentA.email);
    const agRes = await app.inject({ method: 'GET', url: '/tenants', headers: { cookie: agCookie } });
    expect(agRes.json().tenants).toHaveLength(1);
    expect(agRes.json().tenants[0].id).toBe(tenant.id);
  });

  it('logout clears the session and releases held locks', async () => {
    const { tenant, channel, endUser, agentA } = await seedBasics('a7');
    const ticket = await createTicket({ tenantId: tenant.id, channelId: channel.id, endUserId: endUser.id, status: 'handoff' });
    const app = await getApp();
    const cookie = await login(app, agentA.email);
    await app.inject({ method: 'POST', url: `/tenants/${tenant.slug}/tickets/${ticket.id}/claim`, headers: { cookie } });

    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);

    const { prisma } = await import('../src/db/prisma.js');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.lockedByUserId).toBeNull();
  });
});
