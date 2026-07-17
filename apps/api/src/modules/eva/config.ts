import type { EvaConfig, Tone } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';

export interface ResolvedEvaConfig {
  l1Enabled: boolean;
  l2Enabled: boolean;
  l3Enabled: boolean;
  l3Model: string;
  handoffConfidenceThreshold: number;
  tone: Tone;
  languages: string[];
  signature: string;
  humanRequestKeywords: string[];
}

const DEFAULTS: ResolvedEvaConfig = {
  l1Enabled: true,
  l2Enabled: true,
  l3Enabled: true,
  l3Model: env.l3DefaultModel,
  handoffConfidenceThreshold: 62,
  tone: 'community',
  languages: ['zh', 'en', 'ms'],
  signature: 'EVA',
  humanRequestKeywords: ['转人工', '人工', 'human', 'agent', 'manusia'],
};

function fromRow(row: EvaConfig): ResolvedEvaConfig {
  return {
    l1Enabled: row.l1Enabled,
    l2Enabled: row.l2Enabled,
    l3Enabled: row.l3Enabled,
    l3Model: row.l3Model,
    handoffConfidenceThreshold: row.handoffConfidenceThreshold,
    tone: row.tone,
    languages: row.languages,
    signature: row.signature,
    humanRequestKeywords: row.humanRequestKeywords,
  };
}

/** Resolve a tenant's EVA config, falling back to sane defaults if unset. */
export async function resolveEvaConfig(tenantId: string): Promise<ResolvedEvaConfig> {
  const row = await prisma.evaConfig.findUnique({ where: { tenantId } });
  return row ? fromRow(row) : { ...DEFAULTS };
}

export function matchesHumanRequest(text: string, keywords: string[]): boolean {
  const h = text.toLowerCase();
  return keywords.some((k) => k && h.includes(k.toLowerCase()));
}
