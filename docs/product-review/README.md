# iCRM 产品审查与竞品研究（2026-07-17）

> 本目录是一次完整的产品审查交付包：全栈实测 → 竞品研究 → 差距分析 → 目标设计 → 优先级 → Roadmap。
> **按约定未做任何大规模系统修改**——本包为调查、对比与方案，待管理层确认后进入开发。

## 交付物索引

| # | 文档 | 对应要求 |
|---|---|---|
| 1 | [01-current-system-inventory.md](01-current-system-inventory.md) | 现有系统完整功能清单（20 模块逐项实测） |
| 2 | [02-bugs-and-ux-issues.md](02-bugs-and-ux-issues.md) | 实测 Bug 及体验问题清单（复现/预期/实际/严重度） |
| 3 | [03-competitor-research.md](03-competitor-research.md) | 主要竞品研究报告（15 家，2025-2026 现状，含来源） |
| 4 | [04-gap-matrix.md](04-gap-matrix.md) | 竞品功能对比矩阵 + 缺失功能清单 + 应删除/合并/重设计清单 |
| 5 | [05-target-product-design.md](05-target-product-design.md) | 最终版 AI CRM 产品架构与"最方便产品"设计 + AI 能力评审 |
| 6 | [06-feature-priorities-P0-P3.md](06-feature-priorities-P0-P3.md) | P0–P3 完整功能优先级（每项 13 个字段） |
| 7 | [07-roadmap.md](07-roadmap.md) | 30/60/90 天 + 6 个月 Roadmap（含各阶段验收标准） |
| 8 | [08-executive-summary.md](08-executive-summary.md) | 一页 Executive Summary + 顶层验收标准 |
| — | [evidence/](evidence/) | 实测截图证据（15 张，文中按文件名引用） |

## 实测方法与范围

- **环境**：本地全栈部署（Postgres 16 + Redis 7 + Fastify API + React 控制台 + 维护 worker），seed 数据。
- **角色**：agent（kendrick）、第二 agent（kclim，撞单）、tenant_admin、super_admin、viewer，以及**终端客户**（LiveChat/Telegram webhook 真实注入消息）。
- **手段**：Playwright 驱动真实 UI 逐项操作并截图；curl/API 边界测试（跨租户、非法迁移、幂等重投、限速探测）；PostgreSQL 直查取证（routing_logs、messages、handoff_reason）；运行仓库自带 84 项单测与 e2e 冒烟验证 README 声明。
- **关键实测结论**：撞单/状态机/租户隔离/幂等**真实可靠**（还其清白项见交付物 2 末节）；**无出站投递（B-00）与收件箱刷屏（B-01）为一票否决级缺陷**。

## 三个最重要的数字

- **0** —— 客户当前能收到的回复条数（无出站投递）。
- **84/84** —— 既有测试全绿：工程底子值得在其上构建，不必推倒重来。
- **$15B / $4.5B** —— Sierra / Decagon 估值，但它们都没有人工工作台；我们的一体化 + AI 成本审计恰好打在全行业最一致的差评上。
