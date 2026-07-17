import { prisma } from '../../../db/prisma.js';
import type { AIContext, AIProvider, AIReply } from '../types.js';

// L1 — Label Answers. Zero-inference DB lookup: keyword match against active
// label_answers for the tenant + locale. A hit replies instantly at confidence 100.

export class LabelAnswerProvider implements AIProvider {
  readonly layer = 'l1' as const;

  isAvailable(): boolean {
    return true; // pure DB lookup, always available
  }

  async answer(ctx: AIContext): Promise<AIReply | null> {
    const candidates = await prisma.labelAnswer.findMany({
      where: { tenantId: ctx.tenantId, isActive: true, locale: ctx.locale },
      select: { id: true, triggerKeywords: true, answerBody: true },
    });
    if (candidates.length === 0) return null;

    const haystack = ctx.userMessage.toLowerCase();
    let best: { id: string; body: string; hits: number } | null = null;

    for (const c of candidates) {
      let hits = 0;
      for (const kw of c.triggerKeywords) {
        if (kw && haystack.includes(kw.toLowerCase())) hits++;
      }
      if (hits > 0 && (!best || hits > best.hits)) {
        best = { id: c.id, body: c.answerBody, hits };
      }
    }

    if (!best) return null;

    await prisma.labelAnswer.update({
      where: { id: best.id },
      data: { hitCount: { increment: 1 } },
    });

    return { reply: best.body, confidence: 100 };
  }
}
