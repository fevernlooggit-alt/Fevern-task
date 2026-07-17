import { prisma } from '../../db/prisma.js';
import { applyTransition } from '../../state/service.js';
import { createMessage } from '../messages/service.js';
import { detectLanguage } from '../../lib/language.js';
import { sanitizeUserContent } from '../../lib/injection.js';
import { resolveEvaConfig, matchesHumanRequest } from './config.js';
import { retrieveKb } from './retrieval.js';
import { route } from './router.js';
import { performHandoff } from './handoff.js';
import { LabelAnswerProvider } from './providers/labelAnswer.js';
import { LocalLLMProvider } from './providers/localLlm.js';
import { ClaudeProvider } from './providers/claude.js';
import type { AIContext } from './types.js';

const LOOP_GUARD_LIMIT = 3; // PRD P0-3.4: 3 consecutive EVA replies without resolution

/**
 * Handle an inbound end-user message: EVA picks up (new→ai), routes through the
 * three layers, and either replies or hands off (P0-3). No-op for tickets already
 * with a human / resolved / closed.
 */
export async function evaHandleInbound(params: {
  tenantId: string;
  ticketId: string;
  userMessageId: string | null;
  userText: string;
}): Promise<void> {
  const { tenantId, ticketId, userText } = params;

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { status: true },
  });
  if (!ticket) return;
  if (ticket.status !== 'new' && ticket.status !== 'ai') return;

  const config = await resolveEvaConfig(tenantId);
  const locale = detectLanguage(userText);

  // 1) Explicit human request → immediate handoff.
  if (matchesHumanRequest(userText, config.humanRequestKeywords)) {
    await performHandoff({ tenantId, ticketId, kind: 'user_request', actor: { type: 'eva' }, locale });
    return;
  }

  // 2) Loop guard: too many EVA replies without resolution. Count non-internal
  //    EVA replies (internal summary notes don't count) — filter meta in JS since
  //    absent-JSON-key filtering is unreliable across Prisma versions.
  const evaMsgs = await prisma.message.findMany({
    where: { ticketId, senderType: 'eva' },
    select: { meta: true },
  });
  const priorEvaReplies = evaMsgs.filter(
    (m) => !(m.meta as { internal?: boolean } | null)?.internal,
  ).length;
  if (priorEvaReplies >= LOOP_GUARD_LIMIT) {
    await performHandoff({ tenantId, ticketId, kind: 'loop_guard', actor: { type: 'eva' }, locale });
    return;
  }

  // 3) EVA picks up a new ticket.
  if (ticket.status === 'new') {
    await applyTransition({ tenantId, ticketId, event: { type: 'eva_pickup' }, actor: { type: 'eva' } });
  }

  // 4) Build context + route.
  const history = await prisma.message.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    select: { senderType: true, body: true, meta: true },
  });
  const kbSnippets = await retrieveKb(tenantId, userText);
  const ctx: AIContext = {
    tenantId,
    ticketId,
    locale,
    userMessage: sanitizeUserContent(userText),
    persona: { tone: config.tone, signature: config.signature, languages: config.languages },
    kbSnippets,
    history: history
      .filter((m) => !(m.meta as { internal?: boolean } | null)?.internal)
      .map((m) => ({ senderType: m.senderType, body: m.body })),
  };

  const decision = await route({
    ctx,
    config,
    providers: {
      l1: new LabelAnswerProvider(),
      l2: new LocalLLMProvider(),
      l3: new ClaudeProvider(config.l3Model),
    },
    logMessageId: params.userMessageId,
  });

  if (decision.kind === 'reply') {
    await prisma.ticket.update({ where: { id: ticketId }, data: { aiConfidence: decision.confidence } });
    await createMessage({
      tenantId,
      ticketId,
      senderType: 'eva',
      body: decision.reply,
      meta: { layer: decision.layer, confidence: decision.confidence },
    });
  } else {
    await performHandoff({
      tenantId,
      ticketId,
      kind: 'low_confidence',
      actor: { type: 'eva' },
      confidence: decision.confidence,
      threshold: config.handoffConfidenceThreshold,
      locale,
    });
  }
}
