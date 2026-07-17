import { describe, it, expect } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { ingestInboundMessage } from '../src/modules/webhooks/ingest.js';
import { getApp, login, seedBasics } from './helpers.js';

async function withLiveChat(slug: string, evaOverrides: Record<string, unknown> = {}) {
  const basics = await seedBasics(slug);
  const channel = await prisma.channel.create({ data: { tenantId: basics.tenant.id, type: 'livechat', status: 'active' } });
  await prisma.evaConfig.create({
    data: { tenantId: basics.tenant.id, l1Enabled: true, l2Enabled: false, l3Enabled: false, handoffConfidenceThreshold: 62, ...evaOverrides },
  });
  return { ...basics, channel };
}

describe('P0-3 — AI-to-human handoff', () => {
  it('low-confidence (no layer can answer) hands off with summary + holding message', async () => {
    const c = await withLiveChat('h1');

    const { ticketId } = await ingestInboundMessage({
      tenantId: c.tenant.id,
      channelId: c.channel.id,
      externalKey: 'lc:player-1',
      displayName: 'Player One',
      body: '我有一个非常复杂的账号纠纷问题需要处理',
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('handoff');
    expect(ticket.handoffReason?.startsWith('low_confidence')).toBe(true);

    const messages = await prisma.message.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } });

    // internal summary note (never sent to the end user)
    const internal = messages.find((m) => (m.meta as { internal?: boolean } | null)?.internal);
    expect(internal).toBeTruthy();
    expect(internal!.senderType).toBe('eva');
    expect(internal!.body).toContain('交接摘要');

    // localized holding message to the end user
    expect(messages.some((m) => m.body.includes('已为您转接人工客服'))).toBe(true);

    // visible system notice
    expect(messages.some((m) => m.senderType === 'system' && m.body.includes('挂起'))).toBe(true);

    // appears in the handoff filter
    const app = await getApp();
    const cookie = await login(app, c.agentA.email);
    const list = await app.inject({ method: 'GET', url: `/tenants/${c.tenant.slug}/tickets?status=handoff`, headers: { cookie } });
    expect(list.json().tickets.some((t: { id: string }) => t.id === ticketId)).toBe(true);
  });

  it('explicit "转人工" request hands off with reason user_request', async () => {
    const c = await withLiveChat('h2');
    const { ticketId } = await ingestInboundMessage({
      tenantId: c.tenant.id,
      channelId: c.channel.id,
      externalKey: 'lc:player-2',
      displayName: 'Player Two',
      body: '不用机器人了，帮我转人工',
    });
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('handoff');
    expect(ticket.handoffReason).toBe('user_request');
  });

  it('the internal note is hidden from a non-console (end-user) perspective but visible to agents', async () => {
    const c = await withLiveChat('h3');
    const { ticketId } = await ingestInboundMessage({
      tenantId: c.tenant.id,
      channelId: c.channel.id,
      externalKey: 'lc:player-3',
      displayName: 'Player Three',
      body: '疑难杂症需要人处理',
    });

    const { listMessages } = await import('../src/modules/messages/service.js');
    const publicView = await listMessages(ticketId, false);
    const agentView = await listMessages(ticketId, true);
    expect(publicView.some((m) => (m.meta as { internal?: boolean } | null)?.internal)).toBe(false);
    expect(agentView.some((m) => (m.meta as { internal?: boolean } | null)?.internal)).toBe(true);
  });
});
