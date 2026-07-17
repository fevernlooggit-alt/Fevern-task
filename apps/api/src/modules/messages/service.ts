import type { Message, Prisma, SenderType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { bus } from '../../realtime/bus.js';

export interface CreateMessageInput {
  tenantId: string;
  ticketId: string;
  senderType: SenderType;
  senderUserId?: string | null;
  body: string;
  meta?: Record<string, unknown>;
  externalMessageId?: string | null;
}

/**
 * Low-level message insert. Sets first_response_at on the first EVA/agent reply
 * (the first actual response to the player — PRD §5 P0-2.3) and emits
 * message.created. Does NOT perform state transitions or locking — callers that
 * need those (agent reply auto-claim) orchestrate them explicitly.
 */
export async function createMessage(input: CreateMessageInput): Promise<Message> {
  const isResponse = input.senderType === 'eva' || input.senderType === 'agent';

  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        ticketId: input.ticketId,
        senderType: input.senderType,
        senderUserId: input.senderUserId ?? null,
        body: input.body,
        meta: (input.meta ?? {}) as Prisma.InputJsonValue,
        externalMessageId: input.externalMessageId ?? null,
      },
    });
    if (isResponse) {
      // Only sets it when still null (first response wins).
      await tx.ticket.updateMany({
        where: { id: input.ticketId, tenantId: input.tenantId, firstResponseAt: null },
        data: { firstResponseAt: m.createdAt },
      });
    }
    return m;
  });

  const internal = Boolean(input.meta?.internal);
  bus.publish({
    type: 'message.created',
    tenantId: input.tenantId,
    ticketId: input.ticketId,
    messageId: message.id,
    senderType: input.senderType,
  });

  return message;
}

/** Returns the full thread for a ticket, oldest→newest. */
export async function listMessages(ticketId: string, includeInternal: boolean): Promise<Message[]> {
  const all = await prisma.message.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  });
  if (includeInternal) return all;
  return all.filter((m) => !(m.meta as { internal?: boolean } | null)?.internal);
}
