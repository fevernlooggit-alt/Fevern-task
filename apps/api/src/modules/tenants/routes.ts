import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';

// Tenant list for the console's tenant switcher: super_admin sees all tenants,
// everyone else sees only their own.
export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants', { preHandler: [authenticate] }, async (req) => {
    const user = req.currentUser!;
    const tenants = await prisma.tenant.findMany({
      where: user.role === 'super_admin' ? {} : { id: user.tenantId ?? '' },
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { tenants };
  });
}
