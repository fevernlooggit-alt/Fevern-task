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

  // Minimal embeddable LiveChat snippet (Phase 3 replaces with a real widget).
  app.get('/widget/:channelId.js', async (req, reply) => {
    const channelId = (req.params as { channelId: string }).channelId;
    reply.header('content-type', 'application/javascript; charset=utf-8');
    return `// iCRM LiveChat widget (minimal stub)
(function(){
  window.iCRM = window.iCRM || {};
  window.iCRM.send = function(sessionKey, name, body){
    return fetch(${JSON.stringify('/webhooks/livechat/' + channelId)}, {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({ sessionKey: sessionKey, name: name, body: body })
    }).then(function(r){ return r.json(); });
  };
})();`;
  });
}
