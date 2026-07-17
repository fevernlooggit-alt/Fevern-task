import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { applyTransition } from '../state/service.js';
import { bus } from '../realtime/bus.js';
import { REOPEN_WINDOW_MS } from '../state/machine.js';

// Scheduled maintenance (PRD Phase 4 / §5). Pure-ish functions so they can be
// unit-tested and driven by the worker on an interval.

/** done → closed after the 7-day reopen window elapses (PRD P0-2). */
export async function closeExpiredDone(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - REOPEN_WINDOW_MS);
  const due = await prisma.ticket.findMany({
    where: { status: 'done', resolvedAt: { lt: cutoff } },
    select: { id: true, tenantId: true },
  });
  for (const t of due) {
    await applyTransition({
      tenantId: t.tenantId,
      ticketId: t.id,
      event: { type: 'close' },
      actor: { type: 'system' },
      eventPayload: { reason: 'auto_close_after_7d' },
    });
  }
  return due.length;
}

/** Release locks whose heartbeat expired (10-minute TTL, PRD P0-4.3). */
export async function cleanupStaleLocks(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - env.lockTtlMinutes * 60_000);
  const stale = await prisma.ticket.findMany({
    where: { lockedByUserId: { not: null }, lockedAt: { lt: cutoff } },
    select: { id: true, tenantId: true, lockedByUserId: true },
  });
  for (const t of stale) {
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: t.id },
        data: { lockedByUserId: null, lockedAt: null },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: t.id,
          actorType: 'system',
          eventType: 'lock_expired',
          payload: { previousHolder: t.lockedByUserId },
        },
      }),
    ]);
    bus.publish({ type: 'lock.changed', tenantId: t.tenantId, ticketId: t.id, lockedByUserId: null, lockedByName: null });
  }
  return stale.length;
}
