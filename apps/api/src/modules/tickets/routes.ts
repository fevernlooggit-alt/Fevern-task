import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';
import { parse } from '../../lib/validate.js';
import { heartbeat } from './locking.js';
import {
  claimTicket,
  getEndUserProfile,
  getTicketThread,
  handoffTicket,
  listTickets,
  releaseTicket,
  reopenTicket,
  replyToTicket,
  resolveTicket,
} from './service.js';
import { retryDelivery } from '../outbound/index.js';

const consoleScope = [authenticate, tenantScope, requireRole(...ROLES.consoleUser)];
const agentScope = [authenticate, tenantScope, requireRole(...ROLES.agentLike)];

const idParams = z.object({ t: z.string(), id: z.string().uuid() });
const listQuery = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});
const replyBody = z.object({ body: z.string().min(1), internal: z.boolean().optional() });
const endUserParams = z.object({ t: z.string(), id: z.string().uuid() });
const retryParams = z.object({ t: z.string(), id: z.string().uuid(), messageId: z.string().uuid() });

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
    const { body, internal } = parse(replyBody, req.body);
    const u = req.currentUser!;
    const ticket = await replyToTicket(req.tenantId!, id, { id: u.id, displayName: u.displayName }, body, {
      internal,
    });
    reply.code(201);
    return { ticket };
  });

  // Manual retry for a failed outbound delivery (P0-1).
  app.post(
    '/tenants/:t/tickets/:id/messages/:messageId/retry-delivery',
    { preHandler: agentScope },
    async (req) => {
      const { messageId } = parse(retryParams, req.params);
      const result = await retryDelivery(req.tenantId!, messageId);
      return { ok: result.ok, error: result.error ?? null };
    },
  );

  // Customer context pane (P0-3): profile + cross-ticket history.
  app.get('/tenants/:t/end-users/:id', { preHandler: consoleScope }, async (req) => {
    const { id } = parse(endUserParams, req.params);
    return getEndUserProfile(req.tenantId!, id);
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
