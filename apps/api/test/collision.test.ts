import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { acquireLock } from '../src/modules/tickets/locking.js';
import { seedBasics, createTicket, getApp, login } from './helpers.js';

describe('P0-4 — assignment with collision detection', () => {
  it('100 races: exactly one agent wins each round; the loser is told the holder', async () => {
    const { tenant, channel, endUser, agentA, agentB } = await seedBasics('race');
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'human', // stays human so claim is a pure lock contest each round
    });

    for (let round = 0; round < 100; round++) {
      // Reset the lock so both agents contend from a clean slate.
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { lockedByUserId: null, lockedAt: null },
      });

      const [a, b] = await Promise.all([
        acquireLock(tenant.id, ticket.id, agentA.id),
        acquireLock(tenant.id, ticket.id, agentB.id),
      ]);

      const winners = [a, b].filter((r) => r.acquired);
      const losers = [a, b].filter((r) => !r.acquired);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);

      const winnerId = a.acquired ? agentA.id : agentB.id;
      const loser = losers[0]!;
      // The loser must learn who holds the lock.
      expect(loser.acquired).toBe(false);
      if (!loser.acquired) {
        expect(loser.holder).not.toBeNull();
        expect(loser.holder!.id).toBe(winnerId);
      }

      // DB reflects exactly the winner.
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(row.lockedByUserId).toBe(winnerId);
    }
  });

  it('API: second claimer gets 409 with the holder identity', async () => {
    const { tenant, channel, endUser, agentA, agentB } = await seedBasics('race-api');
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'handoff',
    });
    const app = await getApp();
    const cookieA = await login(app, agentA.email);
    const cookieB = await login(app, agentB.email);

    const [resA, resB] = await Promise.all([
      app.inject({ method: 'POST', url: `/tenants/${tenant.slug}/tickets/${ticket.id}/claim`, headers: { cookie: cookieA } }),
      app.inject({ method: 'POST', url: `/tenants/${tenant.slug}/tickets/${ticket.id}/claim`, headers: { cookie: cookieB } }),
    ]);

    const codes = [resA.statusCode, resB.statusCode].sort();
    expect(codes).toEqual([200, 409]);

    const conflict = resA.statusCode === 409 ? resA : resB;
    const body = conflict.json();
    expect(body.error.code).toBe('conflict');
    expect(body.error.details.holder).toBeTruthy();
    expect([agentA.id, agentB.id]).toContain(body.error.details.holder.id);

    // Winner drove the ticket to human.
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.status).toBe('human');
  });

  it('stale locks (>10 min) can be taken over, and the takeover is audited', async () => {
    const { tenant, channel, endUser, agentA, agentB } = await seedBasics('stale');
    const elevenMinAgo = new Date(Date.now() - 11 * 60_000);
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'human',
      lockedByUserId: agentA.id,
      lockedAt: elevenMinAgo,
      assigneeUserId: agentA.id,
    });

    const res = await acquireLock(tenant.id, ticket.id, agentB.id);
    expect(res.acquired).toBe(true);

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.lockedByUserId).toBe(agentB.id);

    const takeover = await prisma.ticketEvent.findFirst({
      where: { ticketId: ticket.id, eventType: 'lock_takeover' },
    });
    expect(takeover).not.toBeNull();
    expect((takeover!.payload as { previousHolder?: string }).previousHolder).toBe(agentA.id);
  });

  it('a fresh (non-stale) lock held by another agent cannot be taken', async () => {
    const { tenant, channel, endUser, agentA, agentB } = await seedBasics('fresh');
    const ticket = await createTicket({
      tenantId: tenant.id,
      channelId: channel.id,
      endUserId: endUser.id,
      status: 'human',
      lockedByUserId: agentA.id,
      lockedAt: new Date(),
      assigneeUserId: agentA.id,
    });

    const res = await acquireLock(tenant.id, ticket.id, agentB.id);
    expect(res.acquired).toBe(false);
    if (!res.acquired) expect(res.holder!.id).toBe(agentA.id);
  });
});
