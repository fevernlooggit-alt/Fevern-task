import { prisma } from '../../db/prisma.js';

export type Range = 'day' | '7d' | '30d';

function rangeStart(range: Range, now: Date): Date {
  const days = range === 'day' ? 1 : range === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function summary(tenantId: string, range: Range, now: Date = new Date()) {
  const start = rangeStart(range, now);

  const [todayTickets, createdInRange, resolveEvents, handoffTickets] = await Promise.all([
    prisma.ticket.count({ where: { tenantId, createdAt: { gte: startOfToday(now) } } }),
    prisma.ticket.count({ where: { tenantId, createdAt: { gte: start } } }),
    prisma.ticketEvent.findMany({
      where: { ticket: { tenantId }, eventType: 'resolve', createdAt: { gte: start } },
      select: { fromStatus: true },
    }),
    prisma.ticketEvent.findMany({
      where: { ticket: { tenantId }, toStatus: 'handoff', createdAt: { gte: start } },
      select: { ticketId: true },
      distinct: ['ticketId'],
    }),
  ]);

  const aiResolved = resolveEvents.filter((e) => e.fromStatus === 'ai').length;
  const humanResolved = resolveEvents.filter((e) => e.fromStatus === 'human').length;
  const totalResolved = aiResolved + humanResolved;
  const aiResolutionRate = totalResolved > 0 ? aiResolved / totalResolved : 0;
  const handoffRate = createdInRange > 0 ? handoffTickets.length / createdInRange : 0;

  // First-response time, split by whether the first reply was EVA or a human agent.
  const responded = await prisma.ticket.findMany({
    where: { tenantId, firstResponseAt: { gte: start, not: null } },
    select: { id: true, createdAt: true, firstResponseAt: true },
  });
  const firstResponses = await prisma.message.findMany({
    where: { ticketId: { in: responded.map((t) => t.id) }, senderType: { in: ['eva', 'agent'] } },
    orderBy: { createdAt: 'asc' },
    select: { ticketId: true, senderType: true },
  });
  const firstResponderByTicket = new Map<string, string>();
  for (const m of firstResponses) {
    if (!firstResponderByTicket.has(m.ticketId)) firstResponderByTicket.set(m.ticketId, m.senderType);
  }
  const aiDeltas: number[] = [];
  const humanDeltas: number[] = [];
  for (const t of responded) {
    if (!t.firstResponseAt) continue;
    const delta = (t.firstResponseAt.getTime() - t.createdAt.getTime()) / 1000;
    if (firstResponderByTicket.get(t.id) === 'agent') humanDeltas.push(delta);
    else aiDeltas.push(delta);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const agents = await agentPresence(tenantId);

  return {
    range,
    todayTickets,
    aiResolutionRate,
    handoffRate,
    resolved: { ai: aiResolved, human: humanResolved, total: totalResolved },
    firstResponseSeconds: { ai: avg(aiDeltas), human: avg(humanDeltas) },
    agents,
  };
}

export async function routingDistribution(tenantId: string, range: Range, now: Date = new Date()) {
  const start = rangeStart(range, now);
  const grouped = await prisma.routingLog.groupBy({
    by: ['layer'],
    where: { tenantId, createdAt: { gte: start } },
    _count: { _all: true },
    _sum: { costUsd: true },
  });
  const counts: Record<string, number> = { l1: 0, l2: 0, l3: 0, handoff: 0 };
  let costUsd = 0;
  let total = 0;
  for (const g of grouped) {
    counts[g.layer] = g._count._all;
    total += g._count._all;
    costUsd += g._sum.costUsd ?? 0;
  }
  const pct = (n: number) => (total > 0 ? n / total : 0);
  return {
    range,
    total,
    counts,
    distribution: {
      l1: pct(counts.l1!),
      l2: pct(counts.l2!),
      l3: pct(counts.l3!),
      handoff: pct(counts.handoff!),
    },
    costUsd,
  };
}

export async function timeseries(tenantId: string, days = 14, now: Date = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const events = await prisma.ticketEvent.findMany({
    where: { ticket: { tenantId }, eventType: 'resolve', createdAt: { gte: start } },
    select: { fromStatus: true, createdAt: true },
  });

  const buckets = new Map<string, { ai: number; human: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    buckets.set(dayKey(d), { ai: 0, human: 0 });
  }
  for (const e of events) {
    const key = dayKey(e.createdAt);
    const b = buckets.get(key);
    if (!b) continue;
    if (e.fromStatus === 'ai') b.ai += 1;
    else if (e.fromStatus === 'human') b.human += 1;
  }
  return {
    days,
    series: [...buckets.entries()].map(([date, v]) => ({ date, ai: v.ai, human: v.human })),
  };
}

async function agentPresence(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId, role: { in: ['agent', 'tenant_admin'] } },
    select: { id: true, displayName: true, isOnline: true },
    orderBy: { displayName: 'asc' },
  });
  const open = await prisma.ticket.groupBy({
    by: ['assigneeUserId'],
    where: { tenantId, status: 'human' },
    _count: { _all: true },
  });
  const openByUser = new Map(open.map((o) => [o.assigneeUserId, o._count._all]));
  return users.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    isOnline: u.isOnline,
    openTickets: openByUser.get(u.id) ?? 0,
  }));
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
