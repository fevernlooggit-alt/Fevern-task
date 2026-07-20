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
const ACTIVE_STATUSES = ['new', 'ai', 'handoff', 'human'] as const;

export interface ListParams {
  tenantId: string;
  /**
   * Default (omitted / 'active') = the working queue: new|ai|handoff|human.
   * Closed noise never floods the default view (review B-01); 'done' and
   * 'closed' are their own filters. 'all' = literally everything (legacy).
   */
  status?: string;
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
  } else if (!params.status || params.status === 'active') {
    where.status = { in: [...ACTIVE_STATUSES] };
  }
  const q = params.q?.trim();
  if (q) {
    // Search subject, customer name, message bodies, and #number (review B-12).
    const or: Prisma.TicketWhereInput[] = [
      { subject: { contains: q, mode: 'insensitive' } },
      { endUser: { displayName: { contains: q, mode: 'insensitive' } } },
      { messages: { some: { body: { contains: q, mode: 'insensitive' } } } },
    ];
    const num = /^#?(\d{1,9})$/.exec(q);
    if (num) or.push({ number: Number(num[1]) });
    where.OR = or;
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
      endUser: { select: { id: true, displayName: true, email: true } },
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

/**
 * POST /claim — atomic lock + transition to human.
 * `ai` tickets are taken over in one step (ai→handoff→claim through the state
 * machine): "回复/接管即转人工" removes the old two-click dance (review ⚫-5).
 */
export async function claimTicket(tenantId: string, ticketId: string, user: ActingUser): Promise<Ticket> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { status: true },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');
  if (ticket.status === 'done' || ticket.status === 'closed') {
    throw Errors.illegalTransition(`Cannot claim a ticket in status "${ticket.status}"`);
  }

  const lock = await acquireLock(tenantId, ticketId, user.id);
  if (!lock.acquired) {
    throw Errors.conflict('Ticket is locked by another agent', {
      holder: lock.holder ? { id: lock.holder.id, displayName: lock.holder.displayName } : null,
    });
  }

  broadcastLock(tenantId, ticketId, user.id, user.displayName);

  if (ticket.status === 'ai') {
    await applyTransition({
      tenantId,
      ticketId,
      event: { type: 'handoff', reason: 'manual' },
      actor: { type: 'agent', id: user.id },
      eventPayload: { takeover: 'direct_claim' },
    });
  }
  if (ticket.status === 'new' || ticket.status === 'handoff' || ticket.status === 'ai') {
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

/**
 * POST /messages — agent reply with auto-claim (PRD P0-4.5).
 * `internal: true` writes a team-only note (P1-4): no lock, no transition, and
 * it is never delivered to the end user.
 * Replying to an `ai` ticket takes it over in one step (ai→handoff→claim).
 */
export async function replyToTicket(
  tenantId: string,
  ticketId: string,
  user: ActingUser,
  body: string,
  opts: { internal?: boolean } = {},
): Promise<Ticket> {
  const text = body.trim();
  if (!text) throw Errors.validation('Reply body must not be empty');

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { status: true },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');

  if (opts.internal) {
    if (ticket.status === 'closed') throw Errors.illegalTransition('Ticket is closed');
    await createMessage({
      tenantId,
      ticketId,
      senderType: 'agent',
      senderUserId: user.id,
      body: text,
      meta: { internal: true },
    });
    return prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  }

  if (ticket.status === 'done' || ticket.status === 'closed') {
    throw Errors.illegalTransition('Ticket is resolved; reopen it before replying');
  }

  // new | ai | handoff | human → must hold the lock (auto-claim on new/ai/handoff).
  const lock = await acquireLock(tenantId, ticketId, user.id);
  if (!lock.acquired) {
    throw Errors.conflict('Ticket is locked by another agent', {
      holder: lock.holder ? { id: lock.holder.id, displayName: lock.holder.displayName } : null,
    });
  }
  broadcastLock(tenantId, ticketId, user.id, user.displayName);

  if (ticket.status === 'ai') {
    await applyTransition({
      tenantId,
      ticketId,
      event: { type: 'handoff', reason: 'manual' },
      actor: { type: 'agent', id: user.id },
      eventPayload: { takeover: 'direct_reply' },
    });
  }
  if (ticket.status === 'new' || ticket.status === 'handoff' || ticket.status === 'ai') {
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
    number: t.number,
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
    endUser: { select: { id: true; displayName: true; email: true } };
    assignee: { select: { id: true; displayName: true } };
    locker: { select: { id: true; displayName: true } };
  };
}>) {
  return {
    id: t.id,
    number: t.number,
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
    deliveryStatus: m.deliveryStatus,
    deliveryError: m.deliveryError,
    meta: m.meta,
    createdAt: m.createdAt,
  };
}

// ------------------------- customer context (P0-3) -------------------------

/** GET /end-users/:id — customer profile + full cross-ticket history. */
export async function getEndUserProfile(tenantId: string, endUserId: string) {
  const endUser = await prisma.endUser.findFirst({
    where: { id: endUserId, tenantId },
  });
  if (!endUser) throw Errors.notFound('End user not found');

  const [tickets, counts] = await Promise.all([
    prisma.ticket.findMany({
      where: { tenantId, endUserId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        channel: { select: { type: true } },
      },
    }),
    prisma.ticket.groupBy({
      by: ['status'],
      where: { tenantId, endUserId },
      _count: { _all: true },
    }),
  ]);

  return {
    endUser: {
      id: endUser.id,
      displayName: endUser.displayName,
      email: endUser.email,
      telegramId: endUser.telegramId,
      externalKey: endUser.externalKey,
      meta: endUser.meta,
    },
    stats: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    tickets: tickets.map((t) => ({
      id: t.id,
      number: t.number,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      channelType: t.channel.type,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
    })),
  };
}
