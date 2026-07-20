import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { parse } from '../../lib/validate.js';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';
import { env } from '../../config/env.js';

/**
 * Real layer health (P0-8, review B-04): a toggle that is ON while the layer is
 * actually unavailable silently degrades routing — the console must show why.
 */
function layerAvailability() {
  return {
    l1: { available: true as const },
    l2: env.l2BaseUrl
      ? { available: true as const }
      : { available: false as const, reason: 'L2_BASE_URL 未配置，路由将跳过 L2' },
    l3: env.anthropicApiKey
      ? { available: true as const }
      : { available: false as const, reason: 'ANTHROPIC_API_KEY 未配置，路由将跳过 L3' },
  };
}

/** Per-call unit costs come from env (review B-13) — never hardcoded in the UI. */
function layerCosts() {
  return { l1: env.costL1, l2: env.costL2, l3: env.costL3 };
}

const putBody = z.object({
  l1Enabled: z.boolean().optional(),
  l2Enabled: z.boolean().optional(),
  l3Enabled: z.boolean().optional(),
  l3Model: z.string().min(1).optional(),
  handoffConfidenceThreshold: z.number().int().min(0).max(100).optional(),
  tone: z.enum(['community', 'formal', 'concise']).optional(),
  languages: z.array(z.string()).optional(),
  signature: z.string().optional(),
  humanRequestKeywords: z.array(z.string()).optional(),
});

const consoleScope = [authenticate, tenantScope, requireRole(...ROLES.consoleUser)];
const adminScope = [authenticate, tenantScope, requireRole(...ROLES.admin)];

export async function evaConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants/:t/eva-config', { preHandler: consoleScope }, async (req) => {
    const tenantId = req.tenantId!;
    const config =
      (await prisma.evaConfig.findUnique({ where: { tenantId } })) ??
      (await prisma.evaConfig.create({ data: { tenantId } }));
    return { config, availability: layerAvailability(), costs: layerCosts() };
  });

  app.put('/tenants/:t/eva-config', { preHandler: adminScope }, async (req) => {
    const tenantId = req.tenantId!;
    const data = parse(putBody, req.body);
    const config = await prisma.evaConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return { config, availability: layerAvailability(), costs: layerCosts() };
  });
}
