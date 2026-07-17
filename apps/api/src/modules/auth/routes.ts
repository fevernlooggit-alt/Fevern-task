import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { parse } from '../../lib/validate.js';
import { Errors } from '../../lib/errors.js';
import { verifyPassword } from '../../auth/password.js';
import { setSessionCookie, clearSessionCookie, readSessionUserId } from '../../auth/session.js';
import { authenticate } from '../../middleware/auth.js';
import { releaseAllForUser } from '../tickets/locking.js';

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

function publicUser(u: {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string | null;
}) {
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role, tenantId: u.tenantId };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const { email, password } = parse(loginBody, req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Constant-ish path: always run verify to reduce user-enumeration timing signal.
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, '$2a$10$0000000000000000000000000000000000000000000000000000');
    if (!user || !ok) throw Errors.unauthorized('Invalid email or password');

    await prisma.user.update({ where: { id: user.id }, data: { isOnline: true } });
    setSessionCookie(reply, user.id);
    return { user: publicUser(user) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const userId = readSessionUserId(req);
    if (userId) {
      await prisma.user.update({ where: { id: userId }, data: { isOnline: false } }).catch(() => undefined);
      await releaseAllForUser(userId); // unlock on logout (PRD P0-4.6)
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: [authenticate] }, async (req) => {
    return { user: publicUser({ ...req.currentUser!, tenantId: req.currentUser!.tenantId ?? null }) };
  });
}
