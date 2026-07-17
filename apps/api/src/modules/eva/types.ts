import type { Tone } from '@prisma/client';
import type { Lang } from '../../lib/language.js';

export interface KbSnippet {
  id: string;
  title: string;
  body: string;
}

export interface Persona {
  tone: Tone;
  signature: string;
  languages: string[];
}

export interface AIContext {
  tenantId: string;
  ticketId: string;
  locale: Lang;
  /** Already sanitized (prompt-injection-guarded) end-user text. */
  userMessage: string;
  persona: Persona;
  kbSnippets: KbSnippet[];
  /** Recent thread, oldest→newest, for L3. */
  history: Array<{ senderType: string; body: string }>;
}

export interface AIReply {
  reply: string;
  /** Self-reported confidence, 0–100. */
  confidence: number;
}

export type LayerId = 'l1' | 'l2' | 'l3';

export interface AIProvider {
  readonly layer: LayerId;
  /** Cheap availability check (config / env presence). */
  isAvailable(): boolean;
  /** Returns an answer, or null for a miss (L1) / no-answer. */
  answer(ctx: AIContext): Promise<AIReply | null>;
}
