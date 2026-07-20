import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { parse } from '../../lib/validate.js';
import { Errors } from '../../lib/errors.js';
import { ingestInboundMessage } from './ingest.js';

// Public channel inbound endpoints. No console auth — identity is the channel id +
// (for Telegram) provider payload. These are intentionally minimal in Phase 1/2.

const channelParams = z.object({ channelId: z.string().uuid() });

async function loadActiveChannel(channelId: string, type: 'telegram' | 'livechat') {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, type, status: 'active' },
    select: { id: true, tenantId: true },
  });
  if (!channel) throw Errors.notFound('Channel not found or inactive');
  return channel;
}

const telegramBody = z.object({
  update_id: z.number().optional(),
  message: z
    .object({
      message_id: z.number().optional(),
      text: z.string().optional(),
      from: z
        .object({
          id: z.number(),
          first_name: z.string().optional(),
          username: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const livechatBody = z.object({
  sessionKey: z.string().min(1),
  name: z.string().optional(),
  body: z.string().min(1),
  messageId: z.string().optional(),
});

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Telegram inbound (PRD §8).
  app.post('/webhooks/telegram/:channelId', async (req) => {
    const { channelId } = parse(channelParams, req.params);
    const channel = await loadActiveChannel(channelId, 'telegram');
    const update = parse(telegramBody, req.body);

    const msg = update.message;
    if (!msg?.text || !msg.from) return { ok: true, ignored: true };

    const from = msg.from;
    const name = from.first_name ?? from.username ?? `tg:${from.id}`;
    const result = await ingestInboundMessage({
      tenantId: channel.tenantId,
      channelId: channel.id,
      externalKey: `tg:${from.id}`,
      displayName: name,
      telegramId: String(from.id),
      body: msg.text,
      externalMessageId: msg.message_id ? `tg:${channel.id}:${msg.message_id}` : null,
    });
    return { ok: true, ...result };
  });

  // LiveChat widget inbound (minimal; the embeddable snippet posts here).
  app.post('/webhooks/livechat/:channelId', async (req) => {
    const { channelId } = parse(channelParams, req.params);
    const channel = await loadActiveChannel(channelId, 'livechat');
    const data = parse(livechatBody, req.body);

    const result = await ingestInboundMessage({
      tenantId: channel.tenantId,
      channelId: channel.id,
      externalKey: `lc:${data.sessionKey}`,
      displayName: data.name ?? 'Web visitor',
      body: data.body,
      externalMessageId: data.messageId ? `lc:${channel.id}:${data.messageId}` : null,
    });
    return { ok: true, ...result };
  });

  // LiveChat thread poll (P0-1 outbound): the widget reads agent/EVA replies here.
  // Identity = channelId + sessionKey (same shape the inbound webhook trusts).
  const threadQuery = z.object({ sessionKey: z.string().min(1), afterId: z.string().uuid().optional() });
  app.get('/webhooks/livechat/:channelId/thread', async (req) => {
    const { channelId } = parse(channelParams, req.params);
    const channel = await loadActiveChannel(channelId, 'livechat');
    const { sessionKey, afterId } = parse(threadQuery, req.query);

    const endUser = await prisma.endUser.findUnique({
      where: { tenantId_externalKey: { tenantId: channel.tenantId, externalKey: `lc:${sessionKey}` } },
      select: { id: true },
    });
    if (!endUser) return { ticketId: null, messages: [] };

    const ticket = await prisma.ticket.findFirst({
      where: { tenantId: channel.tenantId, endUserId: endUser.id, channelId: channel.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    if (!ticket) return { ticketId: null, messages: [] };

    let after: Date | null = null;
    if (afterId) {
      const anchor = await prisma.message.findFirst({
        where: { id: afterId, ticketId: ticket.id },
        select: { createdAt: true },
      });
      after = anchor?.createdAt ?? null;
    }

    // End-user view: no internal notes, no system lines.
    const rows = await prisma.message.findMany({
      where: {
        ticketId: ticket.id,
        senderType: { in: ['end_user', 'agent', 'eva'] },
        ...(after ? { createdAt: { gt: after } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const visible = rows.filter((m) => !(m.meta as { internal?: boolean } | null)?.internal);
    return {
      ticketId: ticket.id,
      status: ticket.status,
      messages: visible.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        body: m.body,
        createdAt: m.createdAt,
      })),
    };
  });

  // Embeddable LiveChat snippet: send + poll (2s interval) so visitors actually
  // RECEIVE replies — the other half of the conversation loop (review B-00).
  app.get('/widget/:channelId.js', async (req, reply) => {
    const channelId = (req.params as { channelId: string }).channelId;
    reply.header('content-type', 'application/javascript; charset=utf-8');
    return `// iCRM LiveChat widget
(function(){
  var base = ${JSON.stringify('/webhooks/livechat/' + channelId)};
  var lastId = null;
  window.iCRM = window.iCRM || {};
  window.iCRM.send = function(sessionKey, name, body){
    return fetch(base, {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({ sessionKey: sessionKey, name: name, body: body })
    }).then(function(r){ return r.json(); });
  };
  window.iCRM.poll = function(sessionKey, onMessage){
    function tick(){
      var qs = '?sessionKey=' + encodeURIComponent(sessionKey) + (lastId ? '&afterId=' + lastId : '');
      fetch(base + '/thread' + qs).then(function(r){ return r.json(); }).then(function(res){
        (res.messages || []).forEach(function(m){ lastId = m.id; if (m.senderType !== 'end_user') onMessage(m); });
      }).catch(function(){});
    }
    tick();
    return setInterval(tick, 2000);
  };
})();`;
  });
}
