import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { parse } from '../../lib/validate.js';
import { Errors } from '../../lib/errors.js';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';

const idParams = z.object({ t: z.string(), id: z.string().uuid() });
const createBody = z.object({
  triggerKeywords: z.array(z.string().min(1)).min(1),
  locale: z.string().min(2),
  answerBody: z.string().min(1),
  isActive: z.boolean().optional(),
});
const updateBody = createBody.partial();

const consoleScope = [authenticate, tenantScope, requireRole(...ROLES.consoleUser)];
const adminScope = [authenticate, tenantScope, requireRole(...ROLES.admin)];

export async function labelAnswerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants/:t/label-answers', { preHandler: consoleScope }, async (req) => {
    const items = await prisma.labelAnswer.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { hitCount: 'desc' },
    });
    return { labelAnswers: items };
  });

  app.post('/tenants/:t/label-answers', { preHandler: adminScope }, async (req, reply) => {
    const data = parse(createBody, req.body);
    const item = await prisma.labelAnswer.create({ data: { tenantId: req.tenantId!, ...data } });
    reply.code(201);
    return { labelAnswer: item };
  });

  app.put('/tenants/:t/label-answers/:id', { preHandler: adminScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const data = parse(updateBody, req.body);
    const existing = await prisma.labelAnswer.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!existing) throw Errors.notFound('Label answer not found');
    const item = await prisma.labelAnswer.update({ where: { id }, data });
    return { labelAnswer: item };
  });

  app.delete('/tenants/:t/label-answers/:id', { preHandler: adminScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const existing = await prisma.labelAnswer.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!existing) throw Errors.notFound('Label answer not found');
    await prisma.labelAnswer.delete({ where: { id } });
    return { deleted: true };
  });
}
