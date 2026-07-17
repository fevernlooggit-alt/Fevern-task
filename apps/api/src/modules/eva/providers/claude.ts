import { env } from '../../../config/env.js';
import type { AIContext, AIProvider, AIReply } from '../types.js';
import { buildSystemPrompt, parseStructuredReply } from '../prompt.js';

// L3 — Claude via the Anthropic Messages API. Model is per-tenant (eva_configs.l3_model,
// passed in). Unavailable when ANTHROPIC_API_KEY is unset (routing falls to handoff).

export class ClaudeProvider implements AIProvider {
  readonly layer = 'l3' as const;
  private readonly model: string;

  constructor(model?: string) {
    this.model = model ?? env.l3DefaultModel;
  }

  isAvailable(): boolean {
    return Boolean(env.anthropicApiKey);
  }

  async answer(ctx: AIContext): Promise<AIReply | null> {
    if (!env.anthropicApiKey) return null;

    // Fuller context for L3: last-10 thread messages + the current user message.
    const history = ctx.history.slice(-10).map((m) => ({
      role: m.senderType === 'end_user' ? ('user' as const) : ('assistant' as const),
      content: m.body,
    }));
    const messages = [...history, { role: 'user' as const, content: ctx.userMessage }];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.l3TimeoutMs);
    try {
      const res = await fetch(`${env.anthropicBaseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          system: buildSystemPrompt(ctx),
          messages,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((c) => c.type === 'text')?.text;
      if (!text) return null;
      return parseStructuredReply(text);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
