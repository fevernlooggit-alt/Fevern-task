import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { parse } from '../../lib/validate.js';
import { Errors } from '../../lib/errors.js';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';

const idParams = z.object({ t: z.string(), id: z.string().uuid() });
const listQuery = z.object({ q: z.string().optional() });
const createBody = z.object({
  title: z.string().min(1),
  bodyMd: z.string().min(1),
  locale: z.string().min(2),
  tags: z.array(z.string()).optional(),
  sourceRef: z.string().optional(),
  syncStatus: z.enum(['synced', 'pending_confirmation', 'stale']).optional(),
});
const updateBody = createBody.partial();

const consoleScope = [authenticate, tenantScope, requireRole(...ROLES.consoleUser)];
const adminScope = [authenticate, tenantScope, requireRole(...ROLES.admin)];

export async function kbRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants/:t/kb-articles', { preHandler: consoleScope }, async (req) => {
    const { q } = parse(listQuery, req.query);
    const items = await prisma.kbArticle.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q && q.trim()
          ? {
              OR: [
                { title: { contains: q.trim(), mode: 'insensitive' } },
                { bodyMd: { contains: q.trim(), mode: 'insensitive' } },
                { tags: { has: q.trim() } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    // "excluded from EVA" indicator: any article whose sync_status != synced (PRD §7.3).
    return {
      kbArticles: items.map((a) => ({ ...a, excludedFromEva: a.syncStatus !== 'synced' })),
    };
  });

  app.post('/tenants/:t/kb-articles', { preHandler: adminScope }, async (req, reply) => {
    const data = parse(createBody, req.body);
    const item = await prisma.kbArticle.create({
      data: { tenantId: req.tenantId!, ...data, tags: data.tags ?? [] },
    });
    reply.code(201);
    return { kbArticle: item };
  });

  app.put('/tenants/:t/kb-articles/:id', { preHandler: adminScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const data = parse(updateBody, req.body);
    const existing = await prisma.kbArticle.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!existing) throw Errors.notFound('KB article not found');
    const item = await prisma.kbArticle.update({ where: { id }, data });
    return { kbArticle: item };
  });

  app.delete('/tenants/:t/kb-articles/:id', { preHandler: adminScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const existing = await prisma.kbArticle.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!existing) throw Errors.notFound('KB article not found');
    await prisma.kbArticle.delete({ where: { id } });
    return { deleted: true };
  });
}
