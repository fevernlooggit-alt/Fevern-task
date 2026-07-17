import type { FastifyInstance } from 'fastify';
import type { ChannelType, Role, TicketStatus } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { hashPassword } from '../src/auth/password.js';
import { buildApp } from '../src/app.js';

// ------------------------------ db reset ------------------------------

const TABLES = [
  'routing_logs',
  'ticket_events',
  'messages',
  'tickets',
  'end_users',
  'label_answers',
  'kb_articles',
  'eva_configs',
  'channels',
  'users',
  'tenants',
];

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE;`);
}

// ------------------------------ app ------------------------------

let cachedApp: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!cachedApp) {
    cachedApp = await buildApp();
    await cachedApp.ready();
  }
  return cachedApp;
}

export async function closeApp(): Promise<void> {
  if (cachedApp) {
    await cachedApp.close();
    cachedApp = null;
  }
}

// ------------------------------ factories ------------------------------

export async function createTenant(slug = 'acme', name = 'Acme') {
  return prisma.tenant.create({ data: { slug, name } });
}

let userSeq = 0;
export async function createUser(opts: {
  role: Role;
  tenantId: string | null;
  email?: string;
  displayName?: string;
  password?: string;
}) {
  userSeq += 1;
  const passwordHash = await hashPassword(opts.password ?? 'password123');
  return prisma.user.create({
    data: {
      email: opts.email ?? `user${userSeq}@example.com`,
      passwordHash,
      displayName: opts.displayName ?? `User ${userSeq}`,
      role: opts.role,
      tenantId: opts.tenantId,
    },
  });
}

export async function createChannel(tenantId: string, type: ChannelType = 'email') {
  return prisma.channel.create({ data: { tenantId, type, status: 'active' } });
}

export async function createEndUser(tenantId: string, externalKey = `eu-${Math.round(Math.random() * 1e9)}`) {
  return prisma.endUser.create({
    data: { tenantId, externalKey, displayName: 'Player' },
  });
}

export async function createTicket(opts: {
  tenantId: string;
  channelId: string;
  endUserId: string;
  status?: TicketStatus;
  subject?: string;
  lockedByUserId?: string | null;
  lockedAt?: Date | null;
  assigneeUserId?: string | null;
  resolvedAt?: Date | null;
}) {
  return prisma.ticket.create({
    data: {
      tenantId: opts.tenantId,
      channelId: opts.channelId,
      endUserId: opts.endUserId,
      subject: opts.subject ?? 'Test ticket',
      status: opts.status ?? 'new',
      lockedByUserId: opts.lockedByUserId ?? null,
      lockedAt: opts.lockedAt ?? null,
      assigneeUserId: opts.assigneeUserId ?? null,
      resolvedAt: opts.resolvedAt ?? null,
    },
  });
}

/** A tenant with a channel + end user + two agents, ready for ticket tests. */
export async function seedBasics(slug = 'acme') {
  const tenant = await createTenant(slug, slug);
  const channel = await createChannel(tenant.id, 'email');
  const endUser = await createEndUser(tenant.id);
  const agentA = await createUser({ role: 'agent', tenantId: tenant.id, displayName: 'Agent A' });
  const agentB = await createUser({ role: 'agent', tenantId: tenant.id, displayName: 'Agent B' });
  const admin = await createUser({ role: 'tenant_admin', tenantId: tenant.id, displayName: 'Admin' });
  return { tenant, channel, endUser, agentA, agentB, admin };
}

// ------------------------------ http ------------------------------

/** Log in and return the Cookie header string to reuse on subsequent requests. */
export async function login(app: FastifyInstance, email: string, password = 'password123'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error('no session cookie returned');
  return raw.split(';')[0]!; // "icrm_session=...."
}
