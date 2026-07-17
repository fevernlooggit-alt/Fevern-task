import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';
import { parse } from '../../lib/validate.js';
import { heartbeat } from './locking.js';
import {
  claimTicket,
  getTicketThread,
  handoffTicket,
  listTickets,
  releaseTicket,
  reopenTicket,
  replyToTicket,
  resolveTicket,
} from './service.js';

const consoleScope = [authenticate, tenantScope, requireRole(...ROLES.consoleUser)];
const agentScope = [authenticate, tenantScope, requireRole(...ROLES.agentLike)];

const idParams = z.object({ t: z.string(), id: z.string().uuid() });
const listQuery = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});
const replyBody = z.object({ body: z.string().min(1) });

export async function ticketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants/:t/tickets', { preHandler: consoleScope }, async (req) => {
    const q = parse(listQuery, req.query);
    return listTickets({ tenantId: req.tenantId!, ...q });
  });

  app.get('/tenants/:t/tickets/:id', { preHandler: consoleScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    return getTicketThread(req.tenantId!, id);
  });

  app.post('/tenants/:t/tickets/:id/claim', { preHandler: agentScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const u = req.currentUser!;
    const ticket = await claimTicket(req.tenantId!, id, { id: u.id, displayName: u.displayName });
    return { ticket };
  });

  app.post('/tenants/:t/tickets/:id/release', { preHandler: agentScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    return releaseTicket(req.tenantId!, id, req.currentUser!.id);
  });

  app.post('/tenants/:t/tickets/:id/heartbeat', { preHandler: agentScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const ok = await heartbeat(req.tenantId!, id, req.currentUser!.id);
    return { ok };
  });

  app.post('/tenants/:t/tickets/:id/messages', { preHandler: agentScope }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const { body } = parse(replyBody, req.body);
    const u = req.currentUser!;
    const ticket = await replyToTicket(req.tenantId!, id, { id: u.id, displayName: u.displayName }, body);
    reply.code(201);
    return { ticket };
  });

  app.post('/tenants/:t/tickets/:id/handoff', { preHandler: agentScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const u = req.currentUser!;
    const ticket = await handoffTicket(req.tenantId!, id, { id: u.id, displayName: u.displayName });
    return { ticket };
  });

  app.post('/tenants/:t/tickets/:id/resolve', { preHandler: agentScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const u = req.currentUser!;
    const ticket = await resolveTicket(req.tenantId!, id, { id: u.id, displayName: u.displayName });
    return { ticket };
  });

  app.post('/tenants/:t/tickets/:id/reopen', { preHandler: agentScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const u = req.currentUser!;
    return reopenTicket(req.tenantId!, id, { id: u.id, displayName: u.displayName });
  });
}
