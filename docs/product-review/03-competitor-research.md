# 交付物 3 — 主要竞品研究报告（2025–2026 现状）

> 方法：三组并行调研（传统客服套件 / 全栈 CRM / AI 原生新秀），来源以官方定价页、发布会通稿、
> G2/Reddit 用户反馈及第三方评测为准，链接内联。价格若来自第三方估算已注明。

---

## A 组 · 客服套件三巨头：Zendesk / Intercom / Freshdesk

### Zendesk
- **模块**：Agent Workspace 全渠道统一工单；Guide 知识库 + 2025 新 Knowledge Builder（从历史工单自动生成文章）；Triggers/Automations/Macros；Explore 报表；收购 Klaus 而来的原生 **Zendesk QA**（AutoQA 全量会话自动打分）+ Tymeshift WFM——三家中最完整的人力运营套件。
- **AI**：2025 Relate 发布 **Resolution Platform**（AI Agents + Knowledge Graph + Action/App Builder + 治理 + 度量）；Copilot 含 intelligent triage（意图/语言/情感自动打标路由）、Auto Assist（按 procedure 建议/代执行）（[新闻稿](https://www.zendesk.com/newsroom/press-releases/relate-2025-resolution-platform/)）。
- **定价**：Suite $55–115/agent/月；**AI 自主解决按结果计费 ~$1.50/次**（72 小时不重开才算解决）；Copilot ~$50、QA $35、WFM $25 附加——50 人团队全家桶可达 $265/agent/月（[Computer Weekly](https://www.computerweekly.com/news/366611612/Zendesk-debuts-outcome-based-pricing-for-AI-agents)）。
- **强点**：Views/SLA 倒计时列、Side Conversations（工单内向第三方开子会话）、宏体系是行业肌肉记忆。
- **弱点（用户之声）**：贵且报价复杂、实施 4–12 周、自家客服差、Workspace 定制空间小。

### Intercom（Fin）
- **AI 行业标杆**：Fin 3（2025 Pioneer）新增 **Procedures**（自然语言 SOP 可执行）、**Simulations**（上线前用历史对话仿真）、Tasks/Actions（调外部系统退款改单）；官方平均解决率 67%（第三方实测 45–53%）；企业版"65% 保底否则赔 $1M"（[Pioneer 2025](https://www.intercom.com/blog/headlines-from-pioneer-2025/)）。
- **Fin Copilot**：内嵌回复框旁的坐席助手，$29–35/agent/月不限量。
- **定价**：座席 $29/85/132 + **Fin $0.99/resolution**（"assumed resolution"宽松口径是争议焦点）；**Fin for Platforms 可部署在 Zendesk/Salesforce 上**——AI 与 helpdesk 解耦的进攻信号（[fin.ai](https://fin.ai/pricing)）。
- **强点**：公认最现代最快的 inbox（keyboard-first、常驻客户上下文侧栏）；AI 辅助长在工作流内。
- **弱点**：账单不可预测（"bill creep"，Reddit 有 $4k→$9k/月案例）；ticketing/SLA 弱于 Zendesk；高绩效团队每周花 3–5 小时复盘 Fin 失败案例修文档。

### Freshdesk（Freddy）
- **AI**：Freddy AI Agent（宣称最高 80% deflection，实报 23–75%）、Copilot 14 项功能（摘要/建议/语气/情感/相似工单）$29/agent/月、Insights 自然语言问数（beta）。2026 年推出 **Agent Studio + MCP Gateway**（率先押注 MCP 生态）（[SiliconANGLE](https://siliconangle.com/2026/05/14/freshworks-unveils-freddy-ai-agent-studio-mcp-gateway-freshservice/)）。
- **定价**：$19/55/89；**Freddy 按 session 计费 $49/100 sessions（不看结果，bot 没解决也扣费）**。
- **强点**：1–2 周即可上线（对比 Zendesk 4–12 周）；原生 agent collision detection；parent-child 工单。
- **弱点**：AI 全是付费墙、开箱效果需持续调优、知识摄取只吃公开静态页。

### A 组结构性信号
1. 计费锚点从 per-seat 转向 **per-resolution**，"解决"的定义（assumed vs confirmed、静默期）成为新的信任战场。
2. AI agent 与 helpdesk **解耦**（Fin for Platforms 跑在竞品上），护城河转移到知识图谱、action 执行与仿真测试工具链。
3. 三家的空白：与结果挂钩的透明计费、便宜的开箱 AI QA/coaching（只有 Zendesk 有且贵）、免实施的 agentic workflow。

---

## B 组 · 全栈 CRM：Salesforce / HubSpot / Dynamics 365 / Zoho

### Salesforce（Service Cloud + Agentforce）
- **Agentforce 360**（Dreamforce 2025）：对话式 Agent Builder、hybrid reasoning、Voice、监控 Agent 决策链路的 Command Center；效果强绑定 Data Cloud（隐性成本大头）（[通稿](https://www.salesforce.com/news/press-releases/2025/10/13/agentic-enterprise-announcement/)）。
- **定价**：$25–350/用户/月（AI 捆绑版 ~$500）；Agentforce 18 个月三换计费（$2/对话 → Flex Credits $0.10/action → 叠 $125/用户/月），CIO 无法做预算（[CIO](https://www.cio.com/article/4113617/salesforces-agentforce-recalibration-raises-costs-and-complexity-for-cios.html)）。
- **弱点**：15 万+ 客户仅约 8,000 家采用 Agentforce；几乎必配专职 Admin；TCO 被第三方估至 $1 万+/用户/年。

### HubSpot（Breeze）
- **Breeze 三层**：Copilot（全员）、Agents（Customer/Prospecting/Data，INBOUND 2025 扩至 20+）、Intelligence（数据补全/意图）。单一数据库天然 360° 时间线是其对 Salesforce 的核心体验优势。
- **定价**：Pro $90–100/席 + **2026 起 Customer Agent $0.50/成功解决**（四大家中唯一明确按成果计费）（[官方](https://www.hubspot.com/company-news/hubspots-customer-agent-and-prospecting-agent-now-you-pay-when-the-task-is-complete)）。
- **强点**：onboarding 业内最易（自助+学院）；Workflows 线性可视化人人会配。
- **弱点**：Starter→Pro 价格断崖（44 倍）；复杂业务定制天花板。

### Microsoft Dynamics 365
- 2025 年自主 Agent 全面 GA（Case Management / Customer Intent 自动挖掘意图库 / Sales Qualification）；Ignite 2025 发布 **Agent 365**（跨 agent 治理控制平面）。卖点是 AI 长在 Teams/Outlook 工作流里。
- **定价**：$50–195/用户/月 + Copilot Credits（自主触发 ~$0.25/次）。**弱点**：许可体系混乱是头号抱怨、UI 陈旧卡顿、必须伙伴实施。

### Zoho（Zia）
- 2025 发布自研 **Zia LLM**（数据不出自有数据中心）+ Agent Studio（700+ 预置 action）+ Agent Marketplace + MCP Server。
- **定价哲学与三巨头相反**：CRM $14–52/用户/月，**Zia 能力随许可内含不按次收费**；Blueprint 把销售 SOP 变成强约束状态机。**弱点**：支持差、UI 打磨不足、生态外集成浅。

### B 组结构性信号
四家全部从 copilot 辅助转向"自主 Agent + 消费计费"，且计费都在快速试错——AI 定价尚无共识；HubSpot 的按成果计费和 Zoho 的 AI 内含化是两个方向性挑战。

---

## C 组 · AI 原生新秀：Sierra / Decagon / Ada / Forethought / Gorgias / Kustomer / Pylon / Parloa

| 厂商 | 核心 IP | 定价 | 人工工作台 | 关键事实 |
|---|---|---|---|---|
| **Sierra**（$15B 估值） | "constellation of models" + supervisor agents 实时监督 + 确定性 guardrails；Agent SDK | 纯按 resolution，年合同 ≥$150K（估） | ❌ 无，回落客户现有联络中心 | 窄场景宣称 ~90% 解决率；2026-05 再融 $950M |
| **Decagon**（$4.5B） | **AOP**：业务用自然语言写流程、敏感动作（退款/验身）由代码确定性执行；AOP Copilot 从历史工单自动生成 AOP | per-conversation / per-resolution 双轨 | ❌ 无，需回落 Zendesk 等（双系统双付费） | Notion/Duolingo/Hertz 客户 |
| **Ada** | Unified Reasoning Engine 跨渠道共享上下文；**Coaching**（人工点评改变未来行为）+ Simulations + Performance Center | 起步 ~$30K/年（估），门槛年对话 30 万+ | ❌ 无 | G2 4.6 vs Trustpilot 2.0 —— 管理员满意、终端客户痛恨死循环难转人工 |
| **Forethought** | 五 agent 体系 + Autoflows 自然语言编排 | $40K–160K/年（估） | ❌ 嵌入现有 helpdesk | **2026-03 被 Zendesk 收购** |
| **Gorgias** | 电商专用：AI Actions 直接操作 Shopify（改地址/退款）；AI Agent 2.0 兼做导购（resolution = revenue） | ~$0.90–1.00/resolution + 订阅（2025 起双重计费） | ✅ 自带完整 helpdesk | 真实自动化率 26–56%；Shopify-only |
| **Kustomer** | **CRM-first**：客户时间线（非工单）为数据模型，AI 站在完整 CRM 上下文上行动 | $89–139/席 + $0.60/AI 参与对话（转人工也计费） | ✅ AI 与人工同一工作台 | 转接保留全部时间线上下文是最强卖点 |
| **Pylon** | B2B 支持 OS（Slack/Teams 共享频道 + 工单 + KB 一体）；Account Intelligence 从会话提取商机/流失信号 | $59–139/席 + AI 阶梯 | ✅ | NRR 158%，a16z/Bain B 轮 $31M |
| **Parloa**（$3B） | voice-first；上线前**数千次 LLM 模拟对话压力测试** + LLM-as-judge 回归 | ~$300K+/年（估） | ❌ 依赖 CCaaS | 宣称 guardrails 降幻觉 88% |

### C 组结构性信号（对我们最重要）
1. **"AI 层"厂商共同的结构性软肋 = 没有人工工作台**：交接依赖客户现有 helpdesk，双系统、双付费、上下文割裂。**AI-to-human 交接质量是全行业最一致的差评来源**（Ada 的 Trustpilot 2.0 即证据）。**我们恰好把交接和人工工作台做在同一产品里——这是先天结构优势。**
2. 产品逻辑收敛点：自然语言 SOP 编排（AOP/Playbooks/Autoflows/Procedures）+ 敏感动作确定性执行 + 上线前 simulation + 会话级 AI QA。差异在"谁掌握编排权"与 guardrail 确定性。
3. 资本流向 voice 与"agent 即劳动力"；传统 helpdesk 靠并购补课（Zendesk 买 Forethought），独立 AI 层窗口在收窄。

---

## 对我们的十条启示（跨三组综合）

1. **闭环第一**：一切竞品的第一性指标是 resolution rate——前提是回复能送达客户。我们先补出站投递。
2. **一体化是我们的牌**：AI + 人工同一工作台 + 完整上下文交接，打 Sierra/Decagon/Ada 的结构性软肋。
3. **三层成本路由是差异化雏形**：竞品按次收费黑盒；我们每次 AI 调用有层级/延迟/成本/置信度审计——可包装成"透明 AI 成本中心"，直击 Intercom"账单不可预测"痛点。
4. **计费风向**：per-resolution 已成锚点，但"解决"定义是信任战场——做"客户确认 + 7 天不重开"的严格口径 + 全量审计，可作为销售武器。
5. **SOP 编排（自然语言 → 可执行流程）** 是 2025-2026 所有玩家的收敛点，我们的 label answers 只是它的 0.1 版。
6. **Simulation / 回归测试**（Intercom Simulations、Parloa 压测）正在成为企业采购的信任门槛。
7. **AI QA + Coaching** 只有 Zendesk 原生且贵——中端市场空白。
8. **知识飞轮**（从工单自动生成/更新 KB，Zendesk Knowledge Builder、Fin unresolved questions）是解决率的复利来源。
9. **人力运营（QA/WFM）与 CRM 上下文（Kustomer 式时间线）** 决定"AI 用得好不好"，纯 bot 厂商做不了。
10. **实施周期是中小客户的隐形定价**：Freshdesk 1–2 周 vs Zendesk 4–12 周 vs Parloa 1–3 月。"一天上线"本身就是可营销的功能。
