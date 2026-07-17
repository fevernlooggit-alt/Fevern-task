import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { parse } from '../../lib/validate.js';
import { Errors } from '../../lib/errors.js';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';
import { encryptJson, isEncryptedBlob } from '../../lib/crypto.js';

const idParams = z.object({ t: z.string(), id: z.string().uuid() });
const createBody = z.object({
  type: z.enum(['email', 'telegram', 'livechat', 'whatsapp_stub']),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});
const updateBody = z.object({
  config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

const consoleScope = [authenticate, tenantScope, requireRole(...ROLES.consoleUser)];
const adminScope = [authenticate, tenantScope, requireRole(...ROLES.admin)];

// Secrets are NEVER returned. Config is redacted to a boolean + the set of key names.
function redact(row: {
  id: string;
  type: string;
  status: string;
  configEncrypted: unknown;
  createdAt: Date;
}) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    configured: isEncryptedBlob(row.configEncrypted),
    createdAt: row.createdAt,
    // Real IMAP/SMTP/Telegram connectivity checks land with Phase 2; for now health
    // reflects the stored status.
    health: row.status === 'active' ? 'active' : 'disabled',
  };
}

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants/:t/channels', { preHandler: consoleScope }, async (req) => {
    const rows = await prisma.channel.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'asc' },
    });
    return { channels: rows.map(redact) };
  });

  app.post('/tenants/:t/channels', { preHandler: adminScope }, async (req, reply) => {
    const data = parse(createBody, req.body);
    const row = await prisma.channel.create({
      data: {
        tenantId: req.tenantId!,
        type: data.type,
        status: data.status ?? 'active',
        configEncrypted: data.config ? (encryptJson(data.config) as object) : undefined,
      },
    });
    reply.code(201);
    return { channel: redact(row) };
  });

  app.put('/tenants/:t/channels/:id', { preHandler: adminScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const data = parse(updateBody, req.body);
    const existing = await prisma.channel.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!existing) throw Errors.notFound('Channel not found');
    const row = await prisma.channel.update({
      where: { id },
      data: {
        status: data.status ?? undefined,
        configEncrypted: data.config ? (encryptJson(data.config) as object) : undefined,
      },
    });
    return { channel: redact(row) };
  });

  app.delete('/tenants/:t/channels/:id', { preHandler: adminScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const existing = await prisma.channel.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!existing) throw Errors.notFound('Channel not found');
    await prisma.channel.delete({ where: { id } });
    return { deleted: true };
  });
}
