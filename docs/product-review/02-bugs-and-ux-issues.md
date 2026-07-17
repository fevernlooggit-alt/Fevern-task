# 交付物 2 — 实测 Bug 及体验问题清单

> 每项含：复现步骤 / 预期 / 实际 / 严重程度 / 证据。环境：本地全栈（seed 数据），2026-07-17。
> 严重度：S0 = 一票否决（不能上线）；S1 = 严重（真实使用会翻车）；S2 = 明显（影响效率/信任）；S3 = 轻微。

## S0 — 一票否决

### B-00 客户永远收不到任何回复（无出站投递）
- **复现**：`POST /webhooks/livechat/:channelId` 发送"排行榜奖励什么时候可以领取？" → 控制台内 EVA 已正确回复（evidence/12b-eva-l1-hit.png）→ 检查客户侧：LiveChat widget（`GET /widget/:id.js`）只有 `send` 函数、无任何拉取/推送回复的机制；全代码库 grep 无 `api.telegram.org`、无 SMTP、无出站队列。
- **预期**：EVA/人工回复通过原渠道回到客户。
- **实际**：回复只存在于内部控制台。客户视角对话单向。
- **影响**：AI 客服产品的核心闭环不存在。所有渠道等同"只进不出"。

### B-01 维护 cron 把收件箱刷成已关闭工单墙
- **复现**：启动 worker → done→closed cron 关闭 67 张历史工单并触发 `updated_at` 更新 → 登录 agent → 收件箱按 updatedAt 排序，前 3 屏全是「历史工单 8-x · 已关闭」（evidence/03-agent-inbox.png），活跃的 handoff 工单不可见；且首屏自动选中一张空的已关闭工单。
- **预期**：活跃工单（new/handoff/human）永远优先；系统性维护不应影响人工排序。
- **实际**：DEC-013 专门为避免此现象设计了 seed，但 cron 恰好复现了它。「全部」筛选含 closed 噪音，又没有「已关闭」筛选项可反选。
- **影响**：每天 cron 一跑，客服首屏就被垃圾淹没。真实运营不可用。

## S1 — 严重

### B-03 工单列表前端无分页
复现：API `?page=2` 正常返回（25/页，total=134）；UI 无翻页/无限滚动。第 26 张工单在前端不存在。若有大量积压，客服无法触达。

### B-04 AI 层与渠道显示"已启用/已接入"，实际不可用（前后端状态脱节）
复现：不配 `L2_BASE_URL`/`ANTHROPIC_API_KEY` → 后端 provider 汇报 unavailable、路由静默跳过；EVA 配置页 L2/L3 开关仍亮绿显示启用（evidence/14-eva-config.png）；Email Piping 显示「已接入」但 worker 从未实现收信。管理员完全不知道自己买的"三层 AI"实际只剩 L1。
预期：每层/每渠道显示真实健康状态（凭据缺失/连通失败）。

### B-05 EVA 连续 3 次发送一字不差的答案
复现：同一 session 连问 3 次"排行榜奖励…" → 每次命中同一 L1 答案原文重发，第 4 条才 loop-guard 转人工（DB 验证 handoff_reason=loop_guard；evidence/12c-loop-guard.png）。客户体验：机器人复读机。预期：检测到重复命中同一答案时第 2 次即换策略（升级层级或转人工）。

### B-06 无 URL 路由：刷新丢位置、无法分享链接
复现：进入 EVA 配置页 → F5 → 回到收件箱。工单不可链接（无 /tickets/:id 路径），跨团队沟通"你看下这张单"没有句柄。

### B-07 前端不按角色收敛权限
复现：viewer（qa@）登录 → 输入框/发送按钮可操作 → 点击后才吃 403 toast。后端拦截正确，但 UI 引导用户去撞墙。

### B-08 一线客服无法阅读知识库全文
复现：agent/viewer 打开知识库 → 列表仅 120 字截断预览 → 点击卡片无反应（编辑器仅 admin）。客服在回复时无法引用 KB —— 知识库对最需要它的人不可用。

### B-15 无用户管理 + 无登录防护
无邀请/停用/改角色 API 和 UI；无密码修改/重置；无 2FA；实测连续 8 次错误密码无任何限速（最后仍 401 而非 429）。企业客户安全审查过不了。

## S2 — 明显

### B-09 转人工阈值滑块：键盘修改静默丢失
复现：聚焦滑块 → 按 → 键（62→63 UI 生效）→ 刷新 → 仍 62。只监听 onMouseUp/onTouchEnd。可访问性 + 静默数据丢失双重问题。

### B-10 中文输入法 Enter 误发送（代码级确认）
`Inbox.tsx` compose `onKeyDown: e.key==='Enter' && send()`，无 `e.nativeEvent.isComposing` 检查。中文/日文用户在输入法组词中按 Enter 选字会把半截拼音发给客户。对中文市场产品是高频事故。

### B-11 删除无确认、无回收站
标签答案「删除」与 KB 文章「删除」实测均为即点即删（无 dialog、无软删除）。误触即永久丢失生产配置。

### B-12 搜索只搜主题
搜"充值"（消息正文中存在的词）→ 0 结果（evidence/05-search.png）。不搜消息内容、客户名、工单号。

### B-13 监控页假数据混在真数据里
「EVA（AI）· 全天候 · 并发 24」为硬编码；EVA 配置页三层单价 $0.000/$0.0004/$0.012 硬编码（env `COST_L1/L2/L3` 改价后 UI 不变）。管理层基于装饰数字做决策的风险。

### B-14 模型下拉提供不存在的选项
MODEL_OPTIONS 含 `gemini-2.5-pro`，后端仅 Anthropic provider；选中后 L3 调用必失败且无校验/提示。

### B-19 「AI 交接摘要」是模板拼接，非真摘要
固定模板："EVA 已尝试：（EVA 尚未回复）"、"对话轮次：共 2 条消息"（把系统消息也计数）。价值远低于承诺的"AI 摘要"。

### B-21 无任何通知
新 handoff 到达：无浏览器通知/声音/徽标闪烁/邮件。客服不盯屏就漏单。SLA 场景致命。

### B-24 优先级"后端有、前端无"
DB priority 字段 + handoff 队列按优先级排序均已实现，但 UI 无法查看/修改优先级——整条能力不可用。同类：人工请求关键词（DB 可编辑无 UI）、渠道凭据 CRUD（API 有无 UI）、ticket_events 审计（DB 有无 UI）。

### B-28 客服无法写内部备注
内部备注气泡样式已实现（琥珀虚线），但只有系统交接摘要能生成它；compose 无"内部备注"模式。跨班交接没有留言手段。

## S3 — 轻微

- **B-16** 移动端仅"不坏"：纵向堆叠可滚动但信息密度/触控目标未优化（evidence/24-mobile-inbox.png）。
- **B-17** README Quickstart 缺 `prisma generate`（Option B 按文档必失败）；e2e 需未见文档的 `PLAYWRIGHT_CHROMIUM_PATH` 才能在标准环境跑通。
- **B-18** done 状态回复被 422 拒绝（合理）但 UI 无引导文案（按钮只是变灰）。
- **B-20** 首屏自动选中列表第一张单——cron 后是空的 closed 工单。
- **B-22** 工单号 = uuid 前 8 位，无 #1024 式可读编号。
- **B-26** 审计事件无 UI。
- **B-27** 监控图无 tooltip/坐标轴。
- **B-29** 客服在线状态以登录/登出翻转 is_online，浏览器直接关闭不会离线（无心跳级 presence）。

## 实测确认正常（还其清白）

- 撞单保护全链路 ✅（横幅+禁用+409+持锁人+心跳+死锁接管，evidence/08-collision-banner.png）
- 状态机契约 ✅（resolve closed→422 illegal_transition；closed reopen→新联结工单 meta.reopenedFrom）
- 租户隔离 ✅（跨租户 403；A 租户标签词不会命中 B 租户——初测疑似 L1 失灵实为隔离正确）
- 幂等 ✅（同 messageId 重投 duplicate:true 不重复建单）
- 人工请求关键词 ✅（"我要转人工！" → user_request 交接 + 安抚语，evidence/13-handoff-holding-msg.png）
- 测试声明 ✅（84/84 单测；e2e 冒烟在指定 chromium 后 1 passed）
