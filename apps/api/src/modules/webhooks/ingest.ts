import { prisma } from '../../db/prisma.js';
import { createMessage } from '../messages/service.js';
import { evaHandleInbound } from '../eva/engine.js';

// Shared inbound pipeline for channel connectors (Telegram, LiveChat, and — in
// Phase 2 — email). Find-or-create the end_user, find an open ticket or create a
// new one, append the end-user message idempotently, then let EVA handle it.

export interface InboundMessage {
  tenantId: string;
  channelId: string;
  /** Stable per-channel identity of the sender (telegram id, livechat session, email addr). */
  externalKey: string;
  displayName: string;
  email?: string | null;
  telegramId?: string | null;
  body: string;
  /** Provider message id for idempotent re-delivery. */
  externalMessageId?: string | null;
}

const OPEN_STATUSES = ['new', 'ai', 'handoff', 'human'] as const;

function deriveSubject(body: string): string {
  const line = body.split('\n')[0]?.trim() ?? '';
  const s = line.length > 60 ? `${line.slice(0, 60)}…` : line;
  return s || '(无主题)';
}

export async function ingestInboundMessage(
  input: InboundMessage,
): Promise<{ ticketId: string; created: boolean; duplicate: boolean }> {
  // Idempotency (PRD P0-1.4): a re-delivered external message id never duplicates.
  if (input.externalMessageId) {
    const existing = await prisma.message.findUnique({
      where: { externalMessageId: input.externalMessageId },
      select: { ticketId: true },
    });
    if (existing) return { ticketId: existing.ticketId, created: false, duplicate: true };
  }

  const endUser = await prisma.endUser.upsert({
    where: { tenantId_externalKey: { tenantId: input.tenantId, externalKey: input.externalKey } },
    create: {
      tenantId: input.tenantId,
      externalKey: input.externalKey,
      displayName: input.displayName,
      email: input.email ?? null,
      telegramId: input.telegramId ?? null,
    },
    update: { displayName: input.displayName },
  });

  let ticket = await prisma.ticket.findFirst({
    where: { tenantId: input.tenantId, endUserId: endUser.id, channelId: input.channelId, status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const created = !ticket;
  if (!ticket) {
    ticket = await prisma.ticket.create({
      data: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        endUserId: endUser.id,
        subject: deriveSubject(input.body),
        status: 'new',
      },
      select: { id: true },
    });
  }

  await createMessage({
    tenantId: input.tenantId,
    ticketId: ticket.id,
    senderType: 'end_user',
    body: input.body,
    externalMessageId: input.externalMessageId ?? null,
  });

  await evaHandleInbound({
    tenantId: input.tenantId,
    ticketId: ticket.id,
    userMessageId: null,
    userText: input.body,
  });

  return { ticketId: ticket.id, created, duplicate: false };
}
