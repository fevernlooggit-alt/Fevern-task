import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { parse } from '../../lib/validate.js';
import { Errors } from '../../lib/errors.js';
import { authenticate, tenantScope, requireRole, ROLES } from '../../middleware/auth.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { releaseAllForUser } from '../tickets/locking.js';

// User & team management (P0-5, review B-15): tenant_admins run onboarding and
// offboarding themselves — no more direct DB edits. super_admin accounts are
// managed out of band and never through this tenant-scoped surface.

const adminScope = [authenticate, tenantScope, requireRole(...ROLES.admin)];

const MANAGED_ROLES = ['tenant_admin', 'agent', 'viewer'] as const;

const createBody = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  role: z.enum(MANAGED_ROLES),
  /** Initial password chosen by the admin; the user changes it via /auth/change-password. */
  password: z.string().min(8).max(128),
});

const updateBody = z.object({
  displayName: z.string().min(1).max(80).optional(),
  role: z.enum(MANAGED_ROLES).optional(),
  isActive: z.boolean().optional(),
});

const idParams = z.object({ t: z.string(), id: z.string().uuid() });

function publicUser(u: {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isOnline: boolean;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isOnline: u.isOnline,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants/:t/users', { preHandler: adminScope }, async (req) => {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return { users: users.map(publicUser) };
  });

  app.post('/tenants/:t/users', { preHandler: adminScope }, async (req, reply) => {
    const data = parse(createBody, req.body);
    const email = data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw Errors.conflict('A user with this email already exists');

    const user = await prisma.user.create({
      data: {
        tenantId: req.tenantId!,
        email,
        displayName: data.displayName,
        role: data.role,
        passwordHash: await hashPassword(data.password),
      },
    });
    reply.code(201);
    return { user: publicUser(user) };
  });

  app.put('/tenants/:t/users/:id', { preHandler: adminScope }, async (req) => {
    const { id } = parse(idParams, req.params);
    const data = parse(updateBody, req.body);

    const target = await prisma.user.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!target) throw Errors.notFound('User not found');
    if (id === req.currentUser!.id && data.isActive === false) {
      throw Errors.badRequest('You cannot deactivate your own account');
    }

    const user = await prisma.user.update({ where: { id }, data });
    if (data.isActive === false) {
      // Deactivation releases any ticket locks the user still holds.
      await releaseAllForUser(id);
      await prisma.user.update({ where: { id }, data: { isOnline: false } });
    }
    return { user: publicUser(user) };
  });

  // Self-service password change — any console user.
  const changeBody = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });
  app.post('/auth/change-password', { preHandler: [authenticate] }, async (req) => {
    const { currentPassword, newPassword } = parse(changeBody, req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } });
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw Errors.unauthorized('Current password is incorrect');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return { ok: true };
  });
}
