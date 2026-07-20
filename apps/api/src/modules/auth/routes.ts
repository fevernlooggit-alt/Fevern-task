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

// Login rate limiting (P0-5, review B-15): 5 failures per identity+IP within a
// 15-minute window trigger a cooldown. In-memory is deliberate for v1 (single
// instance); the seam moves to Redis with horizontal scale.
const FAIL_LIMIT = 5;
const WINDOW_MS = 15 * 60_000;
const COOLDOWN_MS = 15 * 60_000;
interface FailState {
  fails: number[];
  blockedUntil: number;
}
const loginFails = new Map<string, FailState>();

function rateKey(ip: string, email: string): string {
  return `${ip}|${email.toLowerCase()}`;
}

export function checkLoginAllowed(ip: string, email: string): void {
  const st = loginFails.get(rateKey(ip, email));
  if (!st) return;
  const now = Date.now();
  if (st.blockedUntil > now) {
    throw Errors.tooManyRequests('Too many failed login attempts; try again later', {
      retryAfterSeconds: Math.ceil((st.blockedUntil - now) / 1000),
    });
  }
}

export function recordLoginFailure(ip: string, email: string): void {
  const key = rateKey(ip, email);
  const now = Date.now();
  const st = loginFails.get(key) ?? { fails: [], blockedUntil: 0 };
  st.fails = st.fails.filter((t) => now - t < WINDOW_MS);
  st.fails.push(now);
  if (st.fails.length >= FAIL_LIMIT) {
    st.blockedUntil = now + COOLDOWN_MS;
    st.fails = [];
  }
  loginFails.set(key, st);
}

export function recordLoginSuccess(ip: string, email: string): void {
  loginFails.delete(rateKey(ip, email));
}

/** Test hook. */
export function resetLoginRateLimiter(): void {
  loginFails.clear();
}

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
    checkLoginAllowed(req.ip, email);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Constant-ish path: always run verify to reduce user-enumeration timing signal.
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, '$2a$10$0000000000000000000000000000000000000000000000000000');
    if (!user || !ok) {
      recordLoginFailure(req.ip, email);
      throw Errors.unauthorized('Invalid email or password');
    }
    if (!user.isActive) throw Errors.unauthorized('Account is deactivated');

    recordLoginSuccess(req.ip, email);
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
