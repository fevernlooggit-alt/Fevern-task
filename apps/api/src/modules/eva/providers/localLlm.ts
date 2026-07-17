import { env } from '../../../config/env.js';
import type { AIContext, AIProvider, AIReply } from '../types.js';
import { buildSystemPrompt, parseStructuredReply } from '../prompt.js';

// L2 — Local LLM via an OpenAI-compatible HTTP endpoint. Auto-disables when
// L2_BASE_URL is unset (DEC-007 / Open Question #1).

export class LocalLLMProvider implements AIProvider {
  readonly layer = 'l2' as const;

  isAvailable(): boolean {
    return Boolean(env.l2BaseUrl);
  }

  async answer(ctx: AIContext): Promise<AIReply | null> {
    if (!env.l2BaseUrl) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.l2TimeoutMs);
    try {
      const res = await fetch(`${env.l2BaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.l2ApiKey ? { authorization: `Bearer ${env.l2ApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: env.l2Model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: buildSystemPrompt(ctx) },
            { role: 'user', content: ctx.userMessage },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      return parseStructuredReply(content);
    } catch {
      // Timeout or network error — the router falls through to the next layer.
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
