import type { Role } from '@prisma/client';

// Request decorations added by the auth + tenant-scope middleware.
declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: {
      id: string;
      email: string;
      displayName: string;
      role: Role;
      tenantId: string | null;
    };
    /** Resolved, validated tenant UUID for the current request (never client-trusted). */
    tenantId?: string;
    tenantSlug?: string;
  }
}

export {};
