import type { Ticket } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { bus } from '../../realtime/bus.js';

// P0-4 — assignment with collision detection.
//
// The claim is a single atomic conditional UPDATE:
//   SET locked_by=me, locked_at=now, assignee=me
//   WHERE id=t AND (locked_by IS NULL OR locked_by=me OR locked_at < now - ttl)
// Postgres serializes concurrent updates to the same row and re-evaluates the WHERE
// against the winner's committed value, so at most ONE racer sees rowCount=1.

export interface LockHolder {
  id: string;
  displayName: string;
}

export type AcquireResult =
  | { acquired: true; ticket: Ticket }
  | { acquired: false; holder: LockHolder | null };

function staleThreshold(now: Date): Date {
  return new Date(now.getTime() - env.lockTtlMinutes * 60_000);
}

async function currentHolder(ticketId: string): Promise<LockHolder | null> {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { locker: { select: { id: true, displayName: true } } },
  });
  return t?.locker ?? null;
}

/**
 * Atomically acquire (or refresh) the lock on a ticket for `userId`.
 * Returns { acquired:false, holder } on collision — the caller maps this to 409.
 */
export async function acquireLock(
  tenantId: string,
  ticketId: string,
  userId: string,
  now: Date = new Date(),
): Promise<AcquireResult> {
  // Pre-read to detect a stale-lock takeover (best-effort audit; the atomic UPDATE
  // below is what actually guarantees a single winner).
  const pre = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { lockedByUserId: true },
  });

  const res = await prisma.ticket.updateMany({
    where: {
      id: ticketId,
      tenantId,
      OR: [
        { lockedByUserId: null },
        { lockedByUserId: userId },
        { lockedAt: { lt: staleThreshold(now) } },
      ],
    },
    data: { lockedByUserId: userId, lockedAt: now, assigneeUserId: userId },
  });

  if (res.count === 1) {
    // If we acquired despite a different prior holder, it was a stale takeover.
    if (pre?.lockedByUserId && pre.lockedByUserId !== userId) {
      await prisma.ticketEvent.create({
        data: {
          ticketId,
          actorType: 'agent',
          actorId: userId,
          eventType: 'lock_takeover',
          payload: { previousHolder: pre.lockedByUserId },
        },
      });
    }
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    return { acquired: true, ticket };
  }

  // Lost the race (or ticket/tenant mismatch) — report the current holder.
  return { acquired: false, holder: await currentHolder(ticketId) };
}

/** Heartbeat: refresh locked_at only if the caller still holds the lock. */
export async function heartbeat(
  tenantId: string,
  ticketId: string,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const res = await prisma.ticket.updateMany({
    where: { id: ticketId, tenantId, lockedByUserId: userId },
    data: { lockedAt: now },
  });
  return res.count === 1;
}

/** Release a lock held by `userId` (manual release / logout). No-op if not held. */
export async function releaseLock(
  tenantId: string,
  ticketId: string,
  userId: string,
): Promise<boolean> {
  const res = await prisma.ticket.updateMany({
    where: { id: ticketId, tenantId, lockedByUserId: userId },
    data: { lockedByUserId: null, lockedAt: null },
  });
  if (res.count === 1) {
    broadcastLock(tenantId, ticketId, null, null);
    return true;
  }
  return false;
}

/** Force-release every lock held by a user (used on logout). */
export async function releaseAllForUser(userId: string): Promise<void> {
  const locked = await prisma.ticket.findMany({
    where: { lockedByUserId: userId },
    select: { id: true, tenantId: true },
  });
  if (locked.length === 0) return;
  await prisma.ticket.updateMany({
    where: { lockedByUserId: userId },
    data: { lockedByUserId: null, lockedAt: null },
  });
  for (const t of locked) broadcastLock(t.tenantId, t.id, null, null);
}

export function broadcastLock(
  tenantId: string,
  ticketId: string,
  lockedByUserId: string | null,
  lockedByName: string | null,
): void {
  bus.publish({ type: 'lock.changed', tenantId, ticketId, lockedByUserId, lockedByName });
}
