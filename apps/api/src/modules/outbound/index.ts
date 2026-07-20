import type { Channel, EndUser, Message } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { bus } from '../../realtime/bus.js';
import { decryptJson, isEncryptedBlob } from '../../lib/crypto.js';

// Outbound delivery (P0-1, review B-00): every agent/EVA reply is pushed back to
// the end user over the ticket's channel. Delivery lifecycle lives on the message
// row (pending → sent | failed) so the console can show per-message ticks and
// failed sends can be retried by the maintenance worker.

const TELEGRAM_TIMEOUT_MS = 8000;
export const MAX_DELIVERY_ATTEMPTS = 3;

export interface DeliveryResult {
  ok: boolean;
  /** Human-readable failure reason; `retryable=false` failures are terminal. */
  error?: string;
  retryable?: boolean;
}

interface OutboundContext {
  message: Message;
  channel: Pick<Channel, 'id' | 'type' | 'configEncrypted' | 'status'>;
  endUser: Pick<EndUser, 'telegramId' | 'externalKey' | 'email'>;
}

/** Injectable for tests — defaults to global fetch. */
export let httpFetch: typeof fetch = (...args) => fetch(...args);
export function setHttpFetch(f: typeof fetch): void {
  httpFetch = f;
}

function channelConfig(channel: OutboundContext['channel']): Record<string, unknown> {
  const raw = channel.configEncrypted;
  if (raw && isEncryptedBlob(raw)) {
    try {
      return decryptJson<Record<string, unknown>>(raw);
    } catch {
      return {};
    }
  }
  return {};
}

async function deliverTelegram(ctx: OutboundContext): Promise<DeliveryResult> {
  const cfg = channelConfig(ctx.channel);
  const botToken = typeof cfg.botToken === 'string' ? cfg.botToken : null;
  if (!botToken) return { ok: false, error: 'telegram_bot_token_not_configured', retryable: false };
  if (!ctx.endUser.telegramId) return { ok: false, error: 'end_user_has_no_telegram_id', retryable: false };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await httpFetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: ctx.endUser.telegramId, text: ctx.message.body }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 4xx from Telegram (bad token / blocked bot) will not fix itself by retrying.
      return { ok: false, error: `telegram_api_${res.status}: ${text.slice(0, 200)}`, retryable: res.status >= 500 };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `telegram_network_error: ${String(err).slice(0, 200)}`, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * LiveChat delivery = making the reply available to the widget, which polls
 * `GET /webhooks/livechat/:channelId/thread`. The message row itself is the
 * delivery medium, so marking it sent is truthful the moment it is committed.
 */
async function deliverLivechat(): Promise<DeliveryResult> {
  return { ok: true };
}

async function deliverUnsupported(type: string): Promise<DeliveryResult> {
  // Honest failure (review P0-8): the console must show the customer will NOT
  // receive this reply on channels without an outbound implementation yet.
  return { ok: false, error: `outbound_not_implemented_for_${type}`, retryable: false };
}

async function runAdapter(ctx: OutboundContext): Promise<DeliveryResult> {
  switch (ctx.channel.type) {
    case 'telegram':
      return deliverTelegram(ctx);
    case 'livechat':
      return deliverLivechat();
    default:
      return deliverUnsupported(ctx.channel.type);
  }
}

function attemptsOf(message: Message): number {
  const meta = (message.meta as { deliveryAttempts?: number } | null) ?? {};
  return typeof meta.deliveryAttempts === 'number' ? meta.deliveryAttempts : 0;
}

/**
 * Deliver one outbound message and persist the outcome. Never throws — every
 * failure lands in delivery_status/delivery_error. Emits `message.updated` so
 * open consoles refresh their delivery ticks.
 */
export async function deliverMessage(messageId: string): Promise<DeliveryResult> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { ticket: { include: { channel: true, endUser: true } } },
  });
  if (!message) return { ok: false, error: 'message_not_found', retryable: false };
  if (message.deliveryStatus === 'sent' || message.deliveryStatus === 'not_applicable') {
    return { ok: true };
  }

  const ctx: OutboundContext = {
    message,
    channel: message.ticket.channel,
    endUser: message.ticket.endUser,
  };
  const attempts = attemptsOf(message) + 1;
  const result = await runAdapter(ctx);

  const terminal = result.ok || result.retryable === false || attempts >= MAX_DELIVERY_ATTEMPTS;
  await prisma.message.update({
    where: { id: messageId },
    data: {
      deliveryStatus: result.ok ? 'sent' : terminal ? 'failed' : 'pending',
      deliveryError: result.ok ? null : result.error ?? 'unknown_error',
      deliveredAt: result.ok ? new Date() : null,
      meta: { ...((message.meta as Record<string, unknown>) ?? {}), deliveryAttempts: attempts },
    },
  });

  bus.publish({
    type: 'message.updated',
    tenantId: message.ticket.tenantId,
    ticketId: message.ticketId,
    messageId,
    deliveryStatus: result.ok ? 'sent' : terminal ? 'failed' : 'pending',
  });

  return result;
}

/** Manual retry from the console (also used by the maintenance worker). */
export async function retryDelivery(tenantId: string, messageId: string): Promise<DeliveryResult> {
  const message = await prisma.message.findFirst({
    where: { id: messageId, ticket: { tenantId } },
    select: { id: true, deliveryStatus: true },
  });
  if (!message) return { ok: false, error: 'message_not_found', retryable: false };
  if (message.deliveryStatus === 'sent') return { ok: true };
  // Reset to pending so deliverMessage runs the adapter again.
  await prisma.message.update({ where: { id: message.id }, data: { deliveryStatus: 'pending' } });
  return deliverMessage(message.id);
}

/** Maintenance sweep: re-run deliveries stuck in pending (crash) or retryable failures. */
export async function retryPendingDeliveries(limit = 50): Promise<number> {
  const stuck = await prisma.message.findMany({
    where: { deliveryStatus: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  let retried = 0;
  for (const m of stuck) {
    await deliverMessage(m.id);
    retried += 1;
  }
  return retried;
}
