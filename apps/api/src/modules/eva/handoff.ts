import { prisma } from '../../db/prisma.js';
import { applyTransition, type Actor } from '../../state/service.js';
import { createMessage } from '../messages/service.js';
import { detectLanguage, type Lang } from '../../lib/language.js';

// P0-3 — AI-to-human handoff. Escalates cleanly with context.

export type HandoffReasonKind = 'low_confidence' | 'user_request' | 'manual' | 'loop_guard';

export interface HandoffInput {
  tenantId: string;
  ticketId: string;
  kind: HandoffReasonKind;
  actor: Actor;
  /** Confidence for low_confidence handoffs (0–100). */
  confidence?: number;
  /** Tenant handoff threshold, for the system message. */
  threshold?: number;
  /** Locale for the end-user holding message; auto-detected from thread if omitted. */
  locale?: Lang;
}

const HOLDING_MESSAGE: Record<Lang, string> = {
  zh: '已为您转接人工客服，请稍候，我们的客服会尽快回复您。',
  en: 'You have been transferred to a human agent. Please hold on — our team will reply shortly.',
  ms: 'Anda telah dipindahkan kepada ejen manusia. Sila tunggu sebentar, pasukan kami akan membalas anda.',
};

function reasonString(kind: HandoffReasonKind, confidence?: number): string {
  if (kind === 'low_confidence' && typeof confidence === 'number') {
    return `low_confidence:${Math.round(confidence)}%`;
  }
  return kind;
}

function systemNotice(kind: HandoffReasonKind, confidence?: number, threshold?: number): string {
  if (kind === 'low_confidence' && typeof confidence === 'number' && typeof threshold === 'number') {
    return `EVA 置信度 ${Math.round(confidence)}% < 阈值 ${threshold}%，工单已挂起等待人工接管`;
  }
  if (kind === 'user_request') return '用户请求人工客服，工单已挂起并进入待接管队列';
  if (kind === 'loop_guard') return 'EVA 连续多次未能解决，已自动转人工';
  return '手动触发 AI→人工交接，工单已挂起并进入待接管队列';
}

async function buildSummary(ticketId: string): Promise<string> {
  const msgs = await prisma.message.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    select: { senderType: true, body: true },
  });
  const lastUser = [...msgs].reverse().find((m) => m.senderType === 'end_user');
  const lastEva = [...msgs].reverse().find((m) => m.senderType === 'eva');
  const excerpt = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

  const bullets = [
    `用户诉求：${lastUser ? excerpt(lastUser.body) : '（无用户消息）'}`,
    `EVA 已尝试：${lastEva ? excerpt(lastEva.body) : '（EVA 尚未回复）'}`,
    `对话轮次：共 ${msgs.length} 条消息`,
    '建议下一步：人工核实用户账号/订单信息后给出结论，并在解决后标记工单解决。',
  ];
  return `【内部备注 · EVA 交接摘要】\n${bullets.map((b) => `• ${b}`).join('\n')}`;
}

/**
 * Perform a handoff: transition → handoff (via ai, picking up a `new` ticket first),
 * append the visible system notice, an internal EVA summary note (meta.internal),
 * and a localized holding message to the end user.
 */
export async function performHandoff(input: HandoffInput): Promise<void> {
  const { tenantId, ticketId } = input;

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { status: true },
  });
  if (!ticket) return;

  // A `new` ticket must pass through `ai` before it can go to `handoff`.
  if (ticket.status === 'new') {
    await applyTransition({ tenantId, ticketId, event: { type: 'eva_pickup' }, actor: { type: 'eva' } });
  }

  await applyTransition({
    tenantId,
    ticketId,
    event: { type: 'handoff', reason: reasonString(input.kind, input.confidence) },
    actor: input.actor,
    eventPayload: { kind: input.kind, confidence: input.confidence ?? null },
  });

  // Visible system notice (centered in the UI, like the prototype).
  await createMessage({
    tenantId,
    ticketId,
    senderType: 'system',
    body: systemNotice(input.kind, input.confidence, input.threshold),
  });

  // Internal handoff summary — never sent to the end user.
  await createMessage({
    tenantId,
    ticketId,
    senderType: 'eva',
    body: await buildSummary(ticketId),
    meta: { internal: true },
  });

  // Localized holding message to the end user.
  let locale = input.locale;
  if (!locale) {
    const lastUser = await prisma.message.findFirst({
      where: { ticketId, senderType: 'end_user' },
      orderBy: { createdAt: 'desc' },
      select: { body: true },
    });
    locale = lastUser ? detectLanguage(lastUser.body) : 'zh';
  }
  await createMessage({ tenantId, ticketId, senderType: 'eva', body: HOLDING_MESSAGE[locale] });
}
