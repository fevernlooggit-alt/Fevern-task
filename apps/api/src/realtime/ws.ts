import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { bus } from './bus.js';
import { readSessionUserId } from '../auth/session.js';
import { prisma } from '../db/prisma.js';

// WS /realtime?tenant=:t — streams ticket.updated / message.created / lock.changed
// for the requested tenant, after validating the caller may access it.

export async function registerRealtime(app: FastifyInstance): Promise<void> {
  app.get('/realtime', { websocket: true }, async (socket: WebSocket, req) => {
    const tenantParam = (req.query as { tenant?: string }).tenant;
    if (!tenantParam) {
      socket.close(1008, 'tenant query param required');
      return;
    }

    const userId = readSessionUserId(req);
    if (!userId) {
      socket.close(1008, 'unauthorized');
      return;
    }

    const [user, tenant] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { role: true, tenantId: true } }),
      prisma.tenant.findFirst({
        where: { OR: [{ id: tenantParam }, { slug: tenantParam }] },
        select: { id: true },
      }),
    ]);

    if (!user || !tenant) {
      socket.close(1008, 'unauthorized');
      return;
    }
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      socket.close(1008, 'forbidden');
      return;
    }

    const tenantId = tenant.id;
    const unsubscribe = bus.subscribe((event) => {
      if (event.tenantId !== tenantId) return;
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    });

    socket.send(JSON.stringify({ type: 'connected', tenantId }));
    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
}
