import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Prisma } from '@prisma/client';
import { env } from './config/env.js';
import { ApiError, Errors } from './lib/errors.js';
import { registerRealtime } from './realtime/ws.js';
import { authRoutes } from './modules/auth/routes.js';
import { ticketRoutes } from './modules/tickets/routes.js';
import { evaConfigRoutes } from './modules/evaConfig/routes.js';
import { labelAnswerRoutes } from './modules/labelAnswers/routes.js';
import { kbRoutes } from './modules/kb/routes.js';
import { channelRoutes } from './modules/channels/routes.js';
import { metricsRoutes } from './modules/metrics/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isTest ? false : { level: env.isProd ? 'info' : 'debug' },
    trustProxy: true,
  });

  await app.register(cookie, { secret: env.sessionSecret });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);

  // Uniform error envelope (PRD §8): { error: { code, message, details? } }.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send(err.toEnvelope());
    }
    // Fastify body-parse / validation errors.
    if ((err as { statusCode?: number }).statusCode === 400) {
      return reply.code(400).send(Errors.badRequest(err.message).toEnvelope());
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return reply.code(409).send(Errors.conflict('Resource already exists').toEnvelope());
      }
      if (err.code === 'P2025') {
        return reply.code(404).send(Errors.notFound().toEnvelope());
      }
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send(Errors.internal().toEnvelope());
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send(Errors.notFound('Route not found').toEnvelope());
  });

  app.get('/health', async () => ({ ok: true, service: 'icrm-api' }));

  await registerRealtime(app);
  await app.register(authRoutes);
  await app.register(ticketRoutes);
  await app.register(evaConfigRoutes);
  await app.register(labelAnswerRoutes);
  await app.register(kbRoutes);
  await app.register(channelRoutes);
  await app.register(metricsRoutes);
  await app.register(webhookRoutes);

  return app;
}
