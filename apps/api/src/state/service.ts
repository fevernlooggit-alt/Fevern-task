import type { Prisma, Ticket } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { bus } from '../realtime/bus.js';
import { Errors } from '../lib/errors.js';
import { transition, type TicketEvent, type TicketState } from './machine.js';

export interface Actor {
  type: 'agent' | 'eva' | 'system' | 'end_user';
  id?: string | null;
}

export interface ApplyTransitionInput {
  tenantId: string;
  ticketId: string;
  event: TicketEvent;
  actor: Actor;
  /** Extra column writes applied atomically with the status change (e.g. lock release). */
  data?: Prisma.TicketUncheckedUpdateInput;
  /** Extra payload merged into the ticket_events audit row. */
  eventPayload?: Record<string, unknown>;
}

/**
 * The ONE funnel for status changes. Loads the ticket, runs the pure state machine,
 * persists the change + an append-only ticket_events row in a single transaction,
 * then emits a realtime ticket.updated event. Throws 422 on illegal transitions.
 */
export async function applyTransition(input: ApplyTransitionInput): Promise<Ticket> {
  const { tenantId, ticketId, event, actor } = input;

  const current = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { id: true, status: true, assigneeUserId: true, handoffReason: true, resolvedAt: true },
  });
  if (!current) throw Errors.notFound('Ticket not found');

  const before: TicketState = {
    status: current.status,
    assigneeUserId: current.assigneeUserId,
    handoffReason: current.handoffReason,
    resolvedAt: current.resolvedAt,
  };

  const result = transition(before, event);
  if (!result.ok) {
    throw Errors.illegalTransition(result.error.message, {
      code: result.error.code,
      from: before.status,
      event: event.type,
    });
  }
  const after = result.ticket;

  const updateData: Prisma.TicketUncheckedUpdateInput = {
    status: after.status,
    assigneeUserId: after.assigneeUserId,
    handoffReason: after.handoffReason,
    resolvedAt: after.resolvedAt,
    ...input.data,
  };

  const [updated] = await prisma.$transaction([
    prisma.ticket.update({ where: { id: ticketId }, data: updateData }),
    prisma.ticketEvent.create({
      data: {
        ticketId,
        actorType: actor.type,
        actorId: actor.id ?? null,
        eventType: event.type,
        fromStatus: before.status,
        toStatus: after.status,
        payload: (input.eventPayload ?? {}) as Prisma.InputJsonValue,
      },
    }),
  ]);

  bus.publish({
    type: 'ticket.updated',
    tenantId,
    ticketId,
    status: updated.status,
    payload: { event: event.type, from: before.status, to: after.status },
  });

  return updated;
}
