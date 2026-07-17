import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

// Stateless signed session cookie (DEC-003). The cookie value is the userId; it is
// signed (HMAC) by @fastify/cookie so it cannot be forged, HTTP-only so JS can't
// read it, and SameSite=Lax.

export const SESSION_COOKIE = 'icrm_session';

export function setSessionCookie(reply: FastifyReply, userId: string): void {
  reply.setCookie(SESSION_COOKIE, userId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    signed: true,
    domain: env.cookieDomain,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Returns the verified userId from the signed cookie, or null. */
export function readSessionUserId(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;
  return unsigned.value;
}
