import { describe, it, expect } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { closeExpiredDone, cleanupStaleLocks } from '../src/jobs/maintenance.js';
import { seedBasics, createTicket } from './helpers.js';

describe('scheduled maintenance', () => {
  it('closes done tickets older than 7 days (done → closed)', async () => {
    const { tenant, channel, endUser } = await seedBasics('m1');
    const old = await createTicket({ tenantId: tenant.id, channelId: channel.id, endUserId: endUser.id, status: 'done', resolvedAt: new Date(Date.now() - 8 * 864e5) });
    const recent = await createTicket({ tenantId: tenant.id, channelId: channel.id, endUserId: endUser.id, status: 'done', resolvedAt: new Date() });

    const closed = await closeExpiredDone();
    expect(closed).toBe(1);

    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('closed');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe('done');

    // audited as a transition
    const ev = await prisma.ticketEvent.findFirst({ where: { ticketId: old.id, toStatus: 'closed' } });
    expect(ev).toBeTruthy();
  });

  it('releases locks whose heartbeat expired', async () => {
    const { tenant, channel, endUser, agentA } = await seedBasics('m2');
    const stale = await createTicket({ tenantId: tenant.id, channelId: channel.id, endUserId: endUser.id, status: 'human', lockedByUserId: agentA.id, lockedAt: new Date(Date.now() - 11 * 60_000), assigneeUserId: agentA.id });
    const fresh = await createTicket({ tenantId: tenant.id, channelId: channel.id, endUserId: endUser.id, status: 'human', lockedByUserId: agentA.id, lockedAt: new Date(), assigneeUserId: agentA.id });

    const released = await cleanupStaleLocks();
    expect(released).toBe(1);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: stale.id } })).lockedByUserId).toBeNull();
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: fresh.id } })).lockedByUserId).toBe(agentA.id);
  });
});
