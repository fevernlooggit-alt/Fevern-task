import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { readSessionUserId } from '../auth/session.js';
import { Errors } from '../lib/errors.js';

// PRD §8 middleware chain: authenticate → tenantScope → requireRole → handler.

/** Loads the signed-in user onto req.currentUser, or throws 401. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const userId = readSessionUserId(req);
  if (!userId) throw Errors.unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, role: true, tenantId: true, isActive: true },
  });
  if (!user) throw Errors.unauthorized('Session user no longer exists');
  if (!user.isActive) throw Errors.unauthorized('Account is deactivated');

  req.currentUser = user;
}

/**
 * Resolves the `:t` route param (tenant UUID or slug) and validates that the
 * current user may access it. Multi-tenant scoping (PRD §2): non-super-admins can
 * only reach their own tenant; the client-supplied `:t` is validated, never trusted.
 */
export async function tenantScope(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const user = req.currentUser;
  if (!user) throw Errors.unauthorized();

  const t = (req.params as { t?: string }).t;
  if (!t) throw Errors.badRequest('Missing tenant in path');

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
  const tenant = await prisma.tenant.findFirst({
    where: isUuid ? { OR: [{ id: t }, { slug: t }] } : { slug: t },
    select: { id: true, slug: true },
  });
  if (!tenant) throw Errors.notFound('Tenant not found');

  if (user.role !== 'super_admin') {
    if (user.tenantId !== tenant.id) {
      // Do not leak existence differences — a cross-tenant access is forbidden.
      throw Errors.forbidden('You do not have access to this tenant');
    }
  }

  req.tenantId = tenant.id;
  req.tenantSlug = tenant.slug;
}

/** Returns a preHandler that requires the current user to hold one of `roles`. */
export function requireRole(...roles: Role[]) {
  return async function roleGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const user = req.currentUser;
    if (!user) throw Errors.unauthorized();
    if (!roles.includes(user.role)) {
      throw Errors.forbidden(`Requires one of: ${roles.join(', ')}`);
    }
  };
}

/** Common role bundles. */
export const ROLES = {
  /** Anyone with console access (everything except end_user). */
  consoleUser: ['super_admin', 'tenant_admin', 'agent', 'viewer'] as Role[],
  /** Can act on tickets (claim/reply/resolve). */
  agentLike: ['super_admin', 'tenant_admin', 'agent'] as Role[],
  /** Tenant configuration. */
  admin: ['super_admin', 'tenant_admin'] as Role[],
};

/** Prehandler bundle: authenticated + tenant-scoped. */
export const scoped = [authenticate, tenantScope];
