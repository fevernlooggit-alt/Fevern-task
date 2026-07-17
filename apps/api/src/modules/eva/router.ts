import type { RoutingLayer } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import type { AIContext, AIProvider } from './types.js';
import type { ResolvedEvaConfig } from './config.js';

// Three-layer routing engine (PRD §6.1). Decides which layer answers, logs every
// AI call to routing_logs, and returns either a reply or a handoff decision.

export type RouteDecision =
  | { kind: 'reply'; layer: RoutingLayer; reply: string; confidence: number }
  | { kind: 'handoff'; confidence: number };

const L2_ESCALATE_BELOW = 70; // PRD §6.1: "L3 if L2 confidence < 70 or l2 disabled"

function unitCost(layer: RoutingLayer): number {
  switch (layer) {
    case 'l1':
      return env.costL1;
    case 'l2':
      return env.costL2;
    case 'l3':
      return env.costL3;
    case 'handoff':
      return 0;
  }
}

async function logRouting(params: {
  tenantId: string;
  ticketId: string;
  messageId: string | null;
  layer: RoutingLayer;
  latencyMs: number;
  confidence: number | null;
}): Promise<void> {
  await prisma.routingLog.create({
    data: {
      tenantId: params.tenantId,
      ticketId: params.ticketId,
      messageId: params.messageId,
      layer: params.layer,
      latencyMs: params.latencyMs,
      costUsd: unitCost(params.layer),
      confidence: params.confidence,
    },
  });
}

export interface RouteInput {
  ctx: AIContext;
  config: ResolvedEvaConfig;
  providers: { l1: AIProvider; l2: AIProvider; l3: AIProvider };
  logMessageId: string | null;
  now?: () => number;
}

/**
 * Run the L1→L2→L3→handoff cascade. Each layer that actually runs is logged.
 * Returns a reply when a layer answers at ≥ threshold, else a handoff decision.
 */
export async function route(input: RouteInput): Promise<RouteDecision> {
  const { ctx, config, providers } = input;
  const now = input.now ?? (() => Date.now());
  const threshold = config.handoffConfidenceThreshold;
  const logBase = { tenantId: ctx.tenantId, ticketId: ctx.ticketId, messageId: input.logMessageId };

  let candidate: { layer: RoutingLayer; reply: string; confidence: number } | null = null;
  let lastConfidence = 0;

  // --- L1 (label answers) ---
  if (config.l1Enabled) {
    const t0 = now();
    const r = await providers.l1.answer(ctx);
    if (r) {
      await logRouting({ ...logBase, layer: 'l1', latencyMs: now() - t0, confidence: r.confidence });
      candidate = { layer: 'l1', reply: r.reply, confidence: r.confidence };
      lastConfidence = r.confidence;
    }
  }

  // --- L2 (local LLM) ---
  if (!candidate && config.l2Enabled && providers.l2.isAvailable()) {
    const t0 = now();
    const r = await providers.l2.answer(ctx);
    await logRouting({ ...logBase, layer: 'l2', latencyMs: now() - t0, confidence: r?.confidence ?? null });
    if (r) {
      lastConfidence = r.confidence;
      if (r.confidence >= L2_ESCALATE_BELOW) {
        candidate = { layer: 'l2', reply: r.reply, confidence: r.confidence };
      }
    }
  }

  // --- L3 (Claude) ---
  if (!candidate && config.l3Enabled && providers.l3.isAvailable()) {
    const t0 = now();
    const r = await providers.l3.answer(ctx);
    await logRouting({ ...logBase, layer: 'l3', latencyMs: now() - t0, confidence: r?.confidence ?? null });
    if (r) {
      lastConfidence = r.confidence;
      candidate = { layer: 'l3', reply: r.reply, confidence: r.confidence };
    }
  }

  // --- decision ---
  if (candidate && candidate.confidence >= threshold) {
    return { kind: 'reply', layer: candidate.layer, reply: candidate.reply, confidence: candidate.confidence };
  }

  const finalConfidence = candidate?.confidence ?? lastConfidence;
  await logRouting({ ...logBase, layer: 'handoff', latencyMs: 0, confidence: finalConfidence });
  return { kind: 'handoff', confidence: finalConfidence };
}
