import type { ChannelType, Prisma, TicketStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { hashPassword } from '../auth/password.js';

// Seed fixtures (PRD §0.7): reproduce the prototype's tickets + KB articles so the
// running app looks like the prototype on first boot, plus tenants, agents, channels,
// EVA configs, label answers, and a fortnight of history for the monitor.

const DEV_PASSWORD = 'password123';

// Small deterministic PRNG so historical seed data is reproducible.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

async function wipe(): Promise<void> {
  await prisma.routingLog.deleteMany();
  await prisma.ticketEvent.deleteMany();
  await prisma.message.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.endUser.deleteMany();
  await prisma.labelAnswer.deleteMany();
  await prisma.kbArticle.deleteMany();
  await prisma.evaConfig.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

async function main(): Promise<void> {
  await wipe();
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const now = new Date();

  // --- tenants ---
  const pw = await prisma.tenant.create({ data: { name: '平行世界 Parallel World', slug: 'parallel-world' } });
  const pwc = await prisma.tenant.create({ data: { name: '稀土 PWC', slug: 'rare-earth-pwc' } });
  const nt = await prisma.tenant.create({ data: { name: 'NTWorld 官方', slug: 'ntworld' } });

  // --- users ---
  await prisma.user.create({
    data: { email: 'boss@ntworld.example', passwordHash, displayName: 'Boss', role: 'super_admin', tenantId: null, isOnline: true },
  });
  await prisma.user.create({
    data: { email: 'admin@parallelworld.example', passwordHash, displayName: 'PW Admin', role: 'tenant_admin', tenantId: pw.id },
  });
  const kendrick = await prisma.user.create({
    data: { email: 'kendrick@parallelworld.example', passwordHash, displayName: 'Kendrick Chan', role: 'agent', tenantId: pw.id, isOnline: true },
  });
  const kclim = await prisma.user.create({
    data: { email: 'kclim@parallelworld.example', passwordHash, displayName: 'KC Lim', role: 'agent', tenantId: pw.id, isOnline: true },
  });
  await prisma.user.create({
    data: { email: 'qa@parallelworld.example', passwordHash, displayName: 'PW QA', role: 'viewer', tenantId: pw.id },
  });
  await prisma.user.create({
    data: { email: 'admin@pwc.example', passwordHash, displayName: 'PWC Admin', role: 'tenant_admin', tenantId: pwc.id },
  });
  await prisma.user.create({
    data: { email: 'agent@pwc.example', passwordHash, displayName: 'PWC Agent', role: 'agent', tenantId: pwc.id, isOnline: true },
  });
  await prisma.user.create({
    data: { email: 'admin@ntworld.example', passwordHash, displayName: 'NT Admin', role: 'tenant_admin', tenantId: nt.id },
  });

  // --- channels ---
  const chan: Record<string, { id: string }> = {};
  chan.pwEmail = await prisma.channel.create({ data: { tenantId: pw.id, type: 'email', status: 'active' } });
  chan.pwTelegram = await prisma.channel.create({ data: { tenantId: pw.id, type: 'telegram', status: 'active' } });
  chan.pwLivechat = await prisma.channel.create({ data: { tenantId: pw.id, type: 'livechat', status: 'active' } });
  chan.pwWhatsapp = await prisma.channel.create({ data: { tenantId: pw.id, type: 'whatsapp_stub', status: 'disabled' } });
  chan.pwcLivechat = await prisma.channel.create({ data: { tenantId: pwc.id, type: 'livechat', status: 'active' } });
  chan.ntEmail = await prisma.channel.create({ data: { tenantId: nt.id, type: 'email', status: 'active' } });

  // --- eva configs ---
  await prisma.evaConfig.create({
    data: { tenantId: pw.id, signature: 'EVA · 平行世界客服大使', tone: 'community', handoffConfidenceThreshold: 62 },
  });
  await prisma.evaConfig.create({ data: { tenantId: pwc.id, signature: 'EVA · 稀土 PWC 客服' } });
  await prisma.evaConfig.create({ data: { tenantId: nt.id, signature: 'EVA · NTWorld' } });

  // --- label answers (L1) ---
  await prisma.labelAnswer.createMany({
    data: [
      { tenantId: pw.id, triggerKeywords: ['换绑邮箱', '换绑'], locale: 'zh', answerBody: '换绑邮箱路径：设置 → 账号安全 → 换绑邮箱，需要旧邮箱验证码 + 新邮箱验证。若旧邮箱已无法登录，请回复"人工申诉"。', hitCount: 12 },
      { tenantId: pw.id, triggerKeywords: ['排行榜', '奖励', '领取'], locale: 'zh', answerBody: 'v0.34 后排行榜奖励领取入口移到「城市 → 荣誉殿堂 → 赛季奖励」，7 天内有效哦。', hitCount: 34 },
      { tenantId: pwc.id, triggerKeywords: ['积分', '兑换', '比例'], locale: 'zh', answerBody: '当前 PWC 积分兑换比例请以商城页面实时显示为准，已为您附上兑换规则文章链接。', hitCount: 21 },
    ],
  });

  // --- KB articles ---
  await prisma.kbArticle.createMany({
    data: [
      { tenantId: pw.id, title: '夺宝玩法规则与发放时效', bodyMd: '夺宝参与条件、开奖机制、道具发放队列说明。道具通常在开奖后 30 分钟内发放，若延迟可提交工单核查。来源：规则.xlsx v3.1 · 夺宝 sheet。', locale: 'zh', tags: ['夺宝'], sourceRef: '规则.xlsx v3.1', syncStatus: 'synced' },
      { tenantId: pw.id, title: 'PWV 提现流程与常见 pending 原因', bodyMd: '链上确认时间、手续费、失败重试机制，以及客服核查 SOP。高峰期确认可能延迟数小时。', locale: 'zh', tags: ['钱包'], sourceRef: '规则.xlsx v3.1', syncStatus: 'synced' },
      { tenantId: pw.id, title: 'v0.34 建筑升级消耗调整对照表', bodyMd: '市政厅、银行、工厂等建筑新旧消耗对照，含生效时间说明。', locale: 'zh', tags: ['v0.34'], sourceRef: '规划团队草稿', syncStatus: 'pending_confirmation' },
      { tenantId: pw.id, title: '账号安全：换绑邮箱 / 申诉流程', bodyMd: '自助换绑路径与无法登录旧邮箱时的人工申诉材料清单。', locale: 'zh', tags: ['账号'], sourceRef: '规则.xlsx v3.1', syncStatus: 'synced' },
      { tenantId: pwc.id, title: '稀土 PWC 积分获取与兑换规则', bodyMd: '积分来源、兑换比例说明、商城实时价格口径。', locale: 'zh', tags: ['稀土PWC'], sourceRef: '规则.xlsx v3.1', syncStatus: 'synced' },
      { tenantId: pw.id, title: '排行榜赛季奖励领取指引', bodyMd: '荣誉殿堂入口位置、领取时限、过期处理规则。', locale: 'zh', tags: ['v0.34'], sourceRef: '规则.xlsx v3.1', syncStatus: 'synced' },
    ],
  });

  // --- prototype tickets ---
  interface SeedMsg { r: 'user' | 'eva' | 'agent' | 'sys'; t: string }
  interface SeedTicket {
    ref: string; tenantId: string; channelId: string; player: string; subject: string;
    status: TicketStatus; lockedBy?: string; assignee?: string; aiConfidence?: number;
    handoffReason?: string; msgs: SeedMsg[]; resolveFrom?: 'ai' | 'human'; routingLayer?: 'l1' | 'l2' | 'l3';
  }

  const senderMap = { user: 'end_user', eva: 'eva', agent: 'agent', sys: 'system' } as const;

  const seedTickets: SeedTicket[] = [
    {
      ref: 'PW-1042', tenantId: pw.id, channelId: chan.pwEmail!.id, player: '夺宝玩家', subject: '夺宝抽奖结果没有到账',
      status: 'handoff', aiConfidence: 41, handoffReason: 'low_confidence:41%',
      msgs: [
        { r: 'user', t: '我今天早上参加夺宝抽中了道具，但是背包里一直没有到账，麻烦查一下。' },
        { r: 'eva', t: '您好，我是 EVA～已查询到您 08:47 的夺宝记录，系统显示发放队列有延迟。通常 30 分钟内自动补发，请您稍后刷新背包确认。' },
        { r: 'user', t: '已经过了一个小时了还是没有，帮我转人工。' },
        { r: 'sys', t: 'EVA 置信度 41% < 阈值 62%，工单已挂起等待人工接管' },
      ],
    },
    {
      ref: 'PW-1041', tenantId: pw.id, channelId: chan.pwLivechat!.id, player: 'PWV 用户', subject: '提现到钱包一直 pending',
      status: 'human', lockedBy: kclim.id, assignee: kclim.id,
      msgs: [
        { r: 'user', t: 'PWV 提现到钱包已经 pending 六个小时了，正常吗？' },
        { r: 'eva', t: '您好～链上确认高峰期可能有延迟。已为您登记订单号，正在核实节点状态。' },
        { r: 'sys', t: 'KC Lim 已接管此工单（分派锁定）' },
        { r: 'agent', t: '您好，我是人工客服 KC。已联系链上运维核查，您的交易在队列中，预计 1 小时内到账，请留意钱包通知。' },
      ],
    },
    {
      ref: 'PW-1040', tenantId: pw.id, channelId: chan.pwEmail!.id, player: '城建玩家', subject: '城市建筑升级消耗数值与公告不符',
      status: 'ai', aiConfidence: 88,
      msgs: [
        { r: 'user', t: '公告说 v0.34 之后市政厅升 5 级消耗下调，但我升级时扣的还是旧数值。' },
        { r: 'eva', t: '您好～已核对 v0.34 更新说明与规则文档（规则.xlsx v3.1）：市政厅 Lv5 消耗确认已下调。请提供您的角色 ID，我帮您核对扣费流水。' },
      ],
    },
    {
      ref: 'PW-1039', tenantId: pw.id, channelId: chan.pwTelegram!.id, player: 'TG 用户', subject: '账号绑定邮箱想换绑',
      status: 'ai', aiConfidence: 95,
      msgs: [
        { r: 'user', t: '想把绑定邮箱换成新的，怎么操作？' },
        { r: 'eva', t: '您好～换绑邮箱路径：设置 → 账号安全 → 换绑邮箱，需要旧邮箱验证码 + 新邮箱验证。若旧邮箱已无法登录，请回复"人工申诉"，我会为您提交换绑工单。' },
      ],
    },
    {
      ref: 'PWC-0227', tenantId: pwc.id, channelId: chan.pwcLivechat!.id, player: 'PWC 用户', subject: '稀土 PWC 积分兑换比例咨询',
      status: 'done', resolveFrom: 'ai', routingLayer: 'l1',
      msgs: [
        { r: 'user', t: '现在 PWC 积分兑换比例是多少？' },
        { r: 'eva', t: '您好～当前兑换比例请以商城页面实时显示为准。已为您附上兑换规则文章链接。' },
        { r: 'sys', t: '用户确认解决 · L1 标签库命中' },
      ],
    },
    {
      ref: 'PW-1038', tenantId: pw.id, channelId: chan.pwEmail!.id, player: '排行榜玩家', subject: '新版排行榜奖励领取入口找不到',
      status: 'done', resolveFrom: 'ai', routingLayer: 'l2',
      msgs: [
        { r: 'user', t: '排行榜奖励在哪领？' },
        { r: 'eva', t: '您好～v0.34 后领取入口移到「城市 → 荣誉殿堂 → 赛季奖励」，7 天内有效哦。' },
        { r: 'sys', t: '用户确认解决 · L2 本地LLM 处理' },
      ],
    },
  ];

  let offset = 0;
  for (const st of seedTickets) {
    offset += 1;
    const createdAt = new Date(now.getTime() - offset * 30 * 60_000);
    const endUser = await prisma.endUser.create({
      data: { tenantId: st.tenantId, externalKey: `seed:${st.ref}`, displayName: st.player },
    });

    let firstResponseAt: Date | null = null;
    let resolvedAt: Date | null = null;

    const ticket = await prisma.ticket.create({
      data: {
        tenantId: st.tenantId,
        channelId: st.channelId,
        endUserId: endUser.id,
        subject: st.subject,
        status: st.status,
        assigneeUserId: st.assignee ?? null,
        lockedByUserId: st.lockedBy ?? null,
        lockedAt: st.lockedBy ? now : null,
        aiConfidence: st.aiConfidence ?? null,
        handoffReason: st.handoffReason ?? null,
        priority: 'normal',
        createdAt,
        // Keep prototype tickets at the top of the updatedAt-sorted inbox.
        updatedAt: new Date(now.getTime() - offset * 60_000),
        meta: { ref: st.ref },
      },
    });

    // messages, timestamped in order
    for (let i = 0; i < st.msgs.length; i++) {
      const m = st.msgs[i]!;
      const at = new Date(createdAt.getTime() + (i + 1) * 60_000);
      if ((m.r === 'eva' || m.r === 'agent') && !firstResponseAt) firstResponseAt = at;
      await prisma.message.create({
        data: {
          ticketId: ticket.id,
          senderType: senderMap[m.r],
          senderUserId: m.r === 'agent' ? (st.assignee ?? null) : null,
          body: m.t,
          createdAt: at,
        },
      });
    }
    if (st.status === 'done') resolvedAt = new Date(createdAt.getTime() + st.msgs.length * 60_000 + 60_000);

    // Raw update so @updatedAt does not overwrite the curated ordering.
    await prisma.$executeRaw`UPDATE tickets SET first_response_at = ${firstResponseAt}, resolved_at = ${resolvedAt}, updated_at = ${new Date(now.getTime() - offset * 60_000)} WHERE id = ${ticket.id}::uuid`;

    // audit events + routing logs matching the thread
    if (st.status === 'handoff') {
      await prisma.ticketEvent.create({ data: { ticketId: ticket.id, actorType: 'eva', eventType: 'handoff', fromStatus: 'ai', toStatus: 'handoff', payload: { kind: 'user_request' } } });
      await prisma.routingLog.create({ data: { tenantId: st.tenantId, ticketId: ticket.id, layer: 'handoff', latencyMs: 0, costUsd: 0, confidence: st.aiConfidence ?? null } });
    }
    if (st.resolveFrom) {
      await prisma.ticketEvent.create({ data: { ticketId: ticket.id, actorType: st.resolveFrom === 'ai' ? 'eva' : 'agent', eventType: 'resolve', fromStatus: st.resolveFrom, toStatus: 'done', payload: {} } });
    }
    if (st.routingLayer) {
      const cost = st.routingLayer === 'l1' ? 0 : st.routingLayer === 'l2' ? 0.0004 : 0.012;
      await prisma.routingLog.create({ data: { tenantId: st.tenantId, ticketId: ticket.id, layer: st.routingLayer, latencyMs: st.routingLayer === 'l1' ? 12 : 380, costUsd: cost, confidence: 100 } });
    }
  }

  // --- 14 days of history for the monitor (Parallel World) ---
  await seedHistory(pw.id, chan.pwEmail!.id, now);

  const counts = {
    tenants: await prisma.tenant.count(),
    users: await prisma.user.count(),
    tickets: await prisma.ticket.count(),
    messages: await prisma.message.count(),
    kbArticles: await prisma.kbArticle.count(),
    labelAnswers: await prisma.labelAnswer.count(),
    routingLogs: await prisma.routingLog.count(),
  };
  // eslint-disable-next-line no-console
  console.log('Seed complete:', counts);
  // eslint-disable-next-line no-console
  console.log(`Dev login password for all users: ${DEV_PASSWORD}`);
}

async function seedHistory(tenantId: string, channelId: string, now: Date): Promise<void> {
  const rand = lcg(20260717);
  const endUser = await prisma.endUser.create({
    data: { tenantId, externalKey: 'seed:history', displayName: '历史玩家' },
  });

  // Days 1–14 ago (never today) so history can never outrank the prototype
  // tickets in the updatedAt-sorted inbox, regardless of timezone.
  for (let d = 14; d >= 1; d--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 10, 0, 0);
    const total = 6 + Math.floor(rand() * 6); // 6–11 resolved per day
    for (let i = 0; i < total; i++) {
      const at = new Date(day.getTime() + i * 90_000);
      const isAi = rand() < 0.71; // ~71% AI resolution
      const ticket = await prisma.ticket.create({
        data: {
          tenantId, channelId, endUserId: endUser.id,
          subject: `历史工单 ${d}-${i}`, status: 'done',
          createdAt: at, firstResponseAt: new Date(at.getTime() + 8_000),
          resolvedAt: new Date(at.getTime() + 5 * 60_000),
          updatedAt: new Date(at.getTime() + 5 * 60_000),
          meta: { seedHistory: true },
        },
      });
      await prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id, actorType: isAi ? 'eva' : 'agent', eventType: 'resolve',
          fromStatus: isAi ? 'ai' : 'human', toStatus: 'done', createdAt: new Date(at.getTime() + 5 * 60_000),
        },
      });
      // routing distribution ~ 46% l1 / 33% l2 / 12% l3 / 9% handoff
      const r = rand();
      const layer: 'l1' | 'l2' | 'l3' | 'handoff' = r < 0.46 ? 'l1' : r < 0.79 ? 'l2' : r < 0.91 ? 'l3' : 'handoff';
      const cost = layer === 'l1' ? 0 : layer === 'l2' ? 0.0004 : layer === 'l3' ? 0.012 : 0;
      await prisma.routingLog.create({
        data: {
          tenantId, ticketId: ticket.id, layer, costUsd: cost,
          latencyMs: layer === 'l1' ? 10 + Math.floor(rand() * 20) : 200 + Math.floor(rand() * 600),
          confidence: layer === 'handoff' ? 40 + Math.floor(rand() * 20) : 70 + Math.floor(rand() * 30),
          createdAt: at,
        } satisfies Prisma.RoutingLogUncheckedCreateInput,
      });
    }
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
