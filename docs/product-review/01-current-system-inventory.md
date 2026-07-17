# 交付物 1 — 现有系统完整功能清单（实测版）

> 审查日期：2026-07-17 · 方法：本地全栈部署（Postgres 16 + Redis 7 + API + React 控制台 + worker），
> 以 5 种角色（agent / 第二 agent / tenant_admin / super_admin / viewer）+ 终端客户（LiveChat/Telegram webhook）
> 逐项实际操作，配合 DB 查询与 API 边界测试验证。截图证据在 `evidence/`，Bug 编号见交付物 2。

## 系统定位现状

iCRM「极光幻影」目前是一个 **多租户 AI 客服工单系统的核心骨架（Phase 1-3）**，不是完整 CRM。
控制台只有 4 个页面：收件箱、EVA 助手配置、知识库、监控。

## 按 20 个模块逐项盘点

### 1. 客户资料与 Contact Management — ❌ 基本缺失
- **DB 有** `end_users` 表（externalKey/displayName/email/telegramId/meta），跨渠道键位已预留。
- **UI 完全没有客户视图**：工单列表只显示客户名字符串，无客户档案页、无历史工单聚合、无跨渠道身份合并、无编辑入口。同一个人从 Telegram 和 LiveChat 进来是两个不相关的 end_user。
- 结论：**后台有数据结构、前端零呈现**（问题 B-23）。

### 2. Leads / Deals / 销售 Pipeline — ❌ 完全没有
无任何模型、API 或页面。当前产品是纯客服工单，不含销售 CRM。

### 3. Inbox 及 Omnichannel 消息管理 — ◑ 半成品，且有严重缺陷
- ✅ 实测可用：列表 + 状态筛选（全部/AI处理中/待转人工/人工处理/已解决）+ 主题搜索 + 徽标（new+handoff 数）+ WebSocket 实时刷新（新工单实时出现，见 `evidence/12b-eva-l1-hit.png`）。
- ✅ 会话流按角色区分气泡（玩家/EVA/人工/系统线/内部备注），生命周期进度条清晰。
- ❌ **B-01 收件箱被已关闭工单刷屏**：维护 cron 批量 done→closed 更新 `updated_at`，67 张"历史工单"浮到列表顶端（`evidence/03-agent-inbox.png`），真实活跃工单被挤出首屏；「全部」筛选含 closed 噪音，却没有单独的「已关闭」筛选项。
- ❌ **B-03 前端无分页**：API 每页 25 条（实测 total=134），UI 没有翻页控件，第 26 张工单在前端"不存在"。
- ❌ 搜索只匹配工单主题，不搜消息内容和客户名（B-12，`evidence/05-search.png`）。
- ❌ 无优先级显示/设置、无手动指派、无批量操作、无排序选项、无 snooze。
- 渠道现状：LiveChat/Telegram **入站**可用（webhook 实测通），Email 仅有接口 seam（worker 未实现），WhatsApp 是 stub。**没有任何出站投递**（B-00，见下文第 4 条）。

### 4. AI 客服与自动回复 — ◑ 三层路由骨架真实可用，但客户收不到
- ✅ 实测通过：L1 标签库命中即回（置信度 100，hit_count 递增，routing_logs 记录 latency/cost）；无 L2/L3 凭据时自动降级 → 低置信度转人工；语言检测（zh/en/ms）；prompt 注入清洗；租户隔离（实测确认 A 租户的关键词不会命中 B 租户，`evidence/12-eva-l1-reply.png` vs `12b-eva-l1-hit.png`）。
- ✅ Loop guard：同一问题 3 次 EVA 回复后第 4 条自动转人工（DB 验证 `handoff_reason=loop_guard`）。
- ❌ **B-00（最严重）：全系统没有出站投递。** EVA/人工的回复只写入 DB + 推送内部 WebSocket。代码库中不存在对 api.telegram.org 的调用、没有 SMTP、LiveChat widget 只有 `send` 没有接收轮询。**从客户视角对话是单向的：发了消息永远收不到回复。** AI 客服"看似完整、实际不可达"。
- ❌ B-05：EVA 对重复提问连发 3 次一字不差的答案才触发 loop guard，没有"已发过此答案"意识。
- ❌ L2/L3 未配置凭据时后端静默跳过，前台开关仍显示"已启用"（B-04）。
- ❌ L3 的 KB 检索是 `contains` 关键词匹配，非向量/语义检索；回复不带引用来源。

### 5. Live Agent 接管机制 — ✅ 这是系统最扎实的部分
- ✅ 实测全部通过：回复自动认领（new/handoff→human）；原子锁抢占，第二客服看到红色冲突横幅 + 输入框禁用（`evidence/08-collision-banner.png`）；API 撞锁返回 409 + 持锁人；60s 心跳续锁；10 分钟死锁可接管（有审计）；resolve/登出释放锁。84 项单测含 100 轮并发竞争测试，全绿。
- ◑ 但接管只有"抢"没有"派"：assignee 字段存在却无任何分配机制（无手动指派/轮询/负载均衡/技能路由）（B-25）。

### 6. Ticket Management — ◑ 生命周期严谨，操作面窄
- ✅ 状态机 new→ai→handoff→human→done→closed 单函数收口，非法迁移 422（实测 resolve closed 返回 `illegal_transition`）；done→human 7 天内可重开；closed 重开自动生成关联新工单（实测验证 `meta.reopenedFrom`）；ticket_events 全程追加审计。
- ❌ 无优先级 UI（DB 字段存在，handoff 队列也按优先级排序——**后端有、前端无**，B-24）；无标签/分类；无合并/拆分；无内部备注编写（客服无法写 note，只有系统生成的交接摘要是内部备注，B-28）；无宏/快捷回复（标签库只服务 EVA，客服不能引用）；无附件（storage seam 未接线）；ID 是 uuid 前 8 位，无人类可读编号（B-22）。

### 7. Customer Journey 与历史记录 — ❌ 缺失
单工单内的消息历史完整，但没有客户维度的时间线：无法看到"这个客户所有历史工单/所有渠道的交互"。ticket_events 审计数据只存 DB，无 UI（B-26）。

### 8. Workflow 与自动化规则 — ❌ 除硬编码外没有
仅有的"自动化"全部硬编码：EVA 三层路由、loop guard、7 天 done→closed cron、死锁清理。
无规则引擎、无触发器/条件/动作配置、无 SLA 自动升级、无自动分配规则。管理员无法配置任何"当 X 发生时做 Y"。

### 9. AI Assistant 配置和知识库 — ◑ 可用但深度有限
- ✅ EVA 配置页实测：L1/L2/L3 开关、转人工阈值滑块、模型/语气/署名、标签库 CRUD 全部落库生效（`evidence/14-eva-config.png`）。
- ✅ 知识库：搜索、Markdown CRUD、sync_status 控制、非 synced 文章排除出 EVA 检索（有"不参与 EVA"标记）。
- ❌ B-09 阈值滑块只监听 onMouseUp，键盘修改静默丢失；B-14 模型下拉含 `gemini-2.5-pro` 但后端只有 Anthropic provider，选中即坏且无校验；B-11 删除标签答案/KB 文章无确认弹窗、无回收站；B-08 viewer/agent 无法阅读 KB 全文（列表仅 120 字预览，点开编辑器是 admin 专属）——知识库对一线客服基本不可用；人工请求关键词（human_request_keywords）在 DB 可编辑但**无 UI**。
- ❌ 无知识缺口分析、无从工单生成文章、无版本历史、无审批流。

### 10. 渠道集成 — ◑ 二通一伪，且全部单向
| 渠道 | 入站 | 出站 | 控制台配置 UI |
|---|---|---|---|
| LiveChat | ✅ webhook 实测通 | ❌ widget 无接收能力 | ❌ 只显示状态 |
| Telegram | ✅ webhook 实测通（建单+EVA 处理） | ❌ 无 bot sendMessage | ❌ 无 token 录入界面 |
| Email | ❌ 未实现（仅接口 seam） | ❌ | ❌ 显示"已接入"（虚假状态，B-04） |
| WhatsApp | ❌ stub | ❌ | 显示"未接入" |
- 渠道凭据 API 支持加密 CRUD（AES-256-GCM，响应脱敏），但**控制台没有渠道管理 UI**——第三处"后端有、前端无"。

### 11. 客户标签、分组和 Segment — ❌ 完全没有
### 12. Task、Reminder 及 Follow-up — ❌ 完全没有
### 13. SLA、Escalation 及 Supervisor 功能 — ❌ 基本没有
- 无 SLA 定义/倒计时/违约提醒。唯一的"升级"是 EVA 转人工。
- 主管视角只有监控页聚合数字；看不到单个客服的处理明细、无法把工单重新分配给别人、无质检工具。

### 14. Analytics / Dashboard / Report — ◑ 单页监控，真实数据+装饰混杂
- ✅ 实测：今日/7天/30天切换生效；AI 自主解决率、平均首响、转人工率、14 天 AI vs 人工趋势、三层路由命中分布、坐席在线状态均来自真实 DB 聚合（`evidence/18-monitor-7d.png`）。
- ❌ B-13：「EVA（AI）全天候·并发 24」是硬编码假数据；前端三层单价 $0/$0.0004/$0.012 硬编码，env 改价后界面不变。
- ❌ 无导出、无定时报表、无按客服/渠道/标签下钻、无 CSAT（系统根本不采集满意度）、图表无 tooltip。

### 15. 用户权限、团队和 Role Management — ◑ 模型对、管理缺
- ✅ 角色模型（super_admin/tenant_admin/agent/viewer）后端执行严格：跨租户 403、viewer 写操作 403、未认证 401（全部实测）。
- ❌ **没有用户管理**：无邀请/建号/停用/改角色的 API 和 UI，无密码修改/重置，无 2FA，登录无速率限制（实测连续 8 次错误密码无 429，B-15）。团队/分组概念不存在。
- ❌ B-07：前端不按角色收敛 UI——viewer 的输入框和发送按钮可点，点击后才吃 403 toast。

### 16. Notification 及内部协作 — ❌ 完全没有
新 handoff 到达无任何提醒（无浏览器通知/声音/邮件/@提及），只靠列表被动刷新。无客服间协作（无内部讨论、无转交留言、无 side conversation）。

### 17. API / Webhook / 第三方集成 — ◑ 入站 API 齐、生态为零
REST 面完整且错误协议统一（409/422 实测符合文档）；实时 WebSocket 可用。但：无 API key/PAT（只有会话 cookie，第三方无法调用）、无出站 webhook、无任何第三方集成（Shopify/Slack/支付…）、无公开 API 文档。

### 18. Audit Log、Security 及系统设置 — ◑ 底子好、面子没有
- ✅ ticket_events 追加式审计、渠道凭据加密存储、注入清洗、锁接管审计。
- ❌ 审计无 UI；无登录审计；无速率限制；无 CSRF token（靠 SameSite=Lax）；无数据导出/删除（合规）；系统设置页不存在（一切靠 env + 直改 DB）。

### 19. Mobile 及屏幕适配 — ◑ 勉强能用
390px 宽实测无横向溢出，布局纵向堆叠（`evidence/24-mobile-inbox.png`），但列表和会话挤在一屏、需大量滚动、无移动导航模式，仅是"没坏"而非移动可用。

### 20. 其他已存在但被埋没的能力
- 路由成本核算（routing_logs 记录每次 AI 调用的 latency + cost）——这是竞品少见的好底子，但只在监控页出现一个百分比。
- 多语言检测 + 按语言的 holding message（zh/en/ms）。
- 幂等去重（同一 external message id 重投不重复建单，实测验证）。
- **无 URL 路由**：整个控制台是单页 state，刷新永远回到收件箱，无法分享工单链接（B-06）。
- **README 本地启动步骤缺 `prisma generate`**，新工程师按文档必然失败（B-17）；e2e 需要未见文档的 `PLAYWRIGHT_CHROMIUM_PATH`。

## 总评

| 维度 | 评价 |
|---|---|
| 工程质量 | ★★★★☆ 状态机/锁/租户隔离/审计/测试是真功夫，84 单测+并发竞争全绿 |
| 功能完整度 | ★★☆☆☆ 只覆盖"AI 工单"一个场景的骨架，CRM 六大件（客户/销售/自动化/SLA/协作/报表）基本为空 |
| 可上线程度 | ★☆☆☆☆ **客户收不到回复（B-00）一票否决**；收件箱刷屏（B-01）+ 无分页（B-03）使真实负载下不可运营 |
| AI 减少人工 | ◑ L1 命中真实省人工；L2/L3 未接通时整条 AI 路只剩"自动转人工" |
