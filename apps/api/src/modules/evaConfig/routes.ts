import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { parse } from '../../lib/validate.js';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';

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
    return { config };
  });

  app.put('/tenants/:t/eva-config', { preHandler: adminScope }, async (req) => {
    const tenantId = req.tenantId!;
    const data = parse(putBody, req.body);
    const config = await prisma.evaConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return { config };
  });
}
