import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';
import { routingDistribution, summary, timeseries, type Range } from './service.js';

const rangeQuery = z.object({ range: z.enum(['day', '7d', '30d']).optional() });
const consoleScope = [authenticate, tenantScope, requireRole(...ROLES.consoleUser)];

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants/:t/metrics/summary', { preHandler: consoleScope }, async (req) => {
    const { range } = parse(rangeQuery, req.query);
    return summary(req.tenantId!, (range ?? '7d') as Range);
  });

  app.get('/tenants/:t/metrics/routing', { preHandler: consoleScope }, async (req) => {
    const { range } = parse(rangeQuery, req.query);
    return routingDistribution(req.tenantId!, (range ?? '7d') as Range);
  });

  app.get('/tenants/:t/metrics/timeseries', { preHandler: consoleScope }, async (req) => {
    return timeseries(req.tenantId!, 14);
  });
}
