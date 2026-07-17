import type { Prisma, Ticket } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { Errors } from '../../lib/errors.js';
import { applyTransition } from '../../state/service.js';
import { createMessage, listMessages } from '../messages/service.js';
import { performHandoff } from '../eva/handoff.js';
import { acquireLock, releaseLock, broadcastLock } from './locking.js';
import { env } from '../../config/env.js';

// ------------------------------ read ------------------------------

const LIST_STATUSES = new Set(['new', 'ai', 'handoff', 'human', 'done', 'closed']);

export interface ListParams {
  tenantId: string;
  status?: string; // 'all' | one of the statuses
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listTickets(params: ListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

  const where: Prisma.TicketWhereInput = { tenantId: params.tenantId };
  if (params.status && params.status !== 'all' && LIST_STATUSES.has(params.status)) {
    where.status = params.status as Ticket['status'];
  }
  if (params.q && params.q.trim()) {
    where.subject = { contains: params.q.trim(), mode: 'insensitive' };
  }

  // Handoff queue: priority (urgent→low) then age (oldest first). Otherwise newest activity.
  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    params.status === 'handoff'
      ? [{ priority: 'desc' }, { createdAt: 'asc' }]
      : [{ updatedAt: 'desc' }];

  const [rows, total, badgeCount] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        channel: { select: { type: true } },
        endUser: { select: { displayName: true } },
        assignee: { select: { id: true, displayName: true } },
        locker: { select: { id: true, displayName: true } },
      },
    }),
    prisma.ticket.count({ where }),
    prisma.ticket.count({ where: { tenantId: params.tenantId, status: { in: ['new', 'handoff'] } } }),
  ]);

  return {
    tickets: rows.map(serializeListItem),
    page,
    pageSize,
    total,
    badgeCount, // inbox badge = new + handoff (PRD P0-3)
  };
}

export async function getTicketThread(tenantId: string, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    include: {
      channel: { select: { type: true } },
      endUser: { select: { displayName: true, email: true } },
      assignee: { select: { id: true, displayName: true } },
      locker: { select: { id: true, displayName: true } },
    },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');

  const [messages, events] = await Promise.all([
    // Console users (agents/admins/viewers) see internal notes.
    listMessages(ticketId, true),
    prisma.ticketEvent.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } }),
  ]);

  return {
    ticket: serializeDetail(ticket),
    messages: messages.map(serializeMessage),
    events,
  };
}

// ---------------------------- mutations ----------------------------

interface ActingUser {
  id: string;
  displayName: string;
}

/** POST /claim — atomic lock + (new|handoff)→human. */
export async function claimTicket(tenantId: string, ticketId: string, user: ActingUser): Promise<Ticket> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { status: true },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');
  if (ticket.status === 'done' || ticket.status === 'closed') {
    throw Errors.illegalTransition(`Cannot claim a ticket in status "${ticket.status}"`);
  }
  if (ticket.status === 'ai') {
    throw Errors.illegalTransition('Ticket is being handled by EVA; use handoff (转人工) to take it over');
  }

  const lock = await acquireLock(tenantId, ticketId, user.id);
  if (!lock.acquired) {
    throw Errors.conflict('Ticket is locked by another agent', {
      holder: lock.holder ? { id: lock.holder.id, displayName: lock.holder.displayName } : null,
    });
  }

  broadcastLock(tenantId, ticketId, user.id, user.displayName);

  if (ticket.status === 'new' || ticket.status === 'handoff') {
    return applyTransition({
      tenantId,
      ticketId,
      event: { type: 'claim', userId: user.id },
      actor: { type: 'agent', id: user.id },
      data: { lockedByUserId: user.id },
    });
  }
  // Already human — lock refreshed, no transition needed.
  return prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
}

/** POST /release — drop the caller's lock. */
export async function releaseTicket(tenantId: string, ticketId: string, userId: string): Promise<{ released: boolean }> {
  const released = await releaseLock(tenantId, ticketId, userId);
  return { released };
}

/** POST /messages — agent reply with auto-claim (PRD P0-4.5). */
export async function replyToTicket(
  tenantId: string,
  ticketId: string,
  user: ActingUser,
  body: string,
): Promise<Ticket> {
  const text = body.trim();
  if (!text) throw Errors.validation('Reply body must not be empty');

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { status: true },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');

  if (ticket.status === 'ai') {
    throw Errors.illegalTransition('EVA is handling this ticket; use handoff (转人工) to take it over');
  }
  if (ticket.status === 'done' || ticket.status === 'closed') {
    throw Errors.illegalTransition('Ticket is resolved; reopen it before replying');
  }

  // new | handoff | human → must hold the lock (auto-claim on new/handoff).
  const lock = await acquireLock(tenantId, ticketId, user.id);
  if (!lock.acquired) {
    throw Errors.conflict('Ticket is locked by another agent', {
      holder: lock.holder ? { id: lock.holder.id, displayName: lock.holder.displayName } : null,
    });
  }
  broadcastLock(tenantId, ticketId, user.id, user.displayName);

  if (ticket.status === 'new' || ticket.status === 'handoff') {
    await applyTransition({
      tenantId,
      ticketId,
      event: { type: 'claim', userId: user.id },
      actor: { type: 'agent', id: user.id },
      data: { lockedByUserId: user.id },
    });
  }

  await createMessage({ tenantId, ticketId, senderType: 'agent', senderUserId: user.id, body: text });
  return prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
}

/** POST /handoff — manual 转人工 by a console user. */
export async function handoffTicket(tenantId: string, ticketId: string, user: ActingUser): Promise<Ticket> {
  await performHandoff({ tenantId, ticketId, kind: 'manual', actor: { type: 'agent', id: user.id } });
  return prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
}

/** POST /resolve — mark resolved (ai|human → done) and unlock. */
export async function resolveTicket(tenantId: string, ticketId: string, user: ActingUser): Promise<Ticket> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { status: true, lockedByUserId: true, lockedAt: true },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');

  // If a human-held ticket is locked by someone else (non-stale), it's a collision.
  if (ticket.status === 'human' && ticket.lockedByUserId && ticket.lockedByUserId !== user.id) {
    const stale = ticket.lockedAt
      ? ticket.lockedAt.getTime() < Date.now() - env.lockTtlMinutes * 60_000
      : true;
    if (!stale) {
      const holder = await prisma.user.findUnique({
        where: { id: ticket.lockedByUserId },
        select: { id: true, displayName: true },
      });
      throw Errors.conflict('Ticket is locked by another agent', { holder });
    }
  }

  const updated = await applyTransition({
    tenantId,
    ticketId,
    event: { type: 'resolve' },
    actor: { type: 'agent', id: user.id },
    data: { lockedByUserId: null, lockedAt: null },
  });
  broadcastLock(tenantId, ticketId, null, null);
  return updated;
}

/** POST /reopen — done→human within 7 days, or a NEW ticket if already closed. */
export async function reopenTicket(
  tenantId: string,
  ticketId: string,
  user: ActingUser,
): Promise<{ ticket: Ticket; createdNew: boolean }> {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!ticket) throw Errors.notFound('Ticket not found');

  // PRD P0-2.4: reopen after closed is forbidden → new ticket referencing the old one.
  if (ticket.status === 'closed') {
    const fresh = await prisma.ticket.create({
      data: {
        tenantId,
        channelId: ticket.channelId,
        endUserId: ticket.endUserId,
        subject: ticket.subject,
        status: 'new',
        priority: ticket.priority,
        meta: { reopenedFrom: ticket.id },
      },
    });
    await createMessage({
      tenantId,
      ticketId: fresh.id,
      senderType: 'system',
      body: `工单由已关闭工单 ${ticket.id} 重新发起`,
      meta: { reopenedFrom: ticket.id },
    });
    return { ticket: fresh, createdNew: true };
  }

  const updated = await applyTransition({
    tenantId,
    ticketId,
    event: { type: 'reopen' },
    actor: { type: 'agent', id: user.id },
  });
  return { ticket: updated, createdNew: false };
}

// --------------------------- serializers ---------------------------

function serializeListItem(t: Prisma.TicketGetPayload<{
  include: {
    channel: { select: { type: true } };
    endUser: { select: { displayName: true } };
    assignee: { select: { id: true; displayName: true } };
    locker: { select: { id: true; displayName: true } };
  };
}>) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    channelType: t.channel.type,
    endUserName: t.endUser.displayName,
    assignee: t.assignee,
    lockedBy: t.locker,
    aiConfidence: t.aiConfidence,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function serializeDetail(t: Prisma.TicketGetPayload<{
  include: {
    channel: { select: { type: true } };
    endUser: { select: { displayName: true; email: true } };
    assignee: { select: { id: true; displayName: true } };
    locker: { select: { id: true; displayName: true } };
  };
}>) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    channelType: t.channel.type,
    endUser: t.endUser,
    assignee: t.assignee,
    lockedBy: t.locker,
    lockedAt: t.lockedAt,
    handoffReason: t.handoffReason,
    aiConfidence: t.aiConfidence,
    firstResponseAt: t.firstResponseAt,
    resolvedAt: t.resolvedAt,
    meta: t.meta,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function serializeMessage(m: Prisma.MessageGetPayload<Record<string, never>>) {
  const meta = (m.meta as { internal?: boolean } | null) ?? {};
  return {
    id: m.id,
    senderType: m.senderType,
    senderUserId: m.senderUserId,
    body: m.body,
    internal: Boolean(meta.internal),
    meta: m.meta,
    createdAt: m.createdAt,
  };
}
