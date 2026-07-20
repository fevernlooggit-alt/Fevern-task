# CHANGELOG — iCRM

> Append-only. Every working session appends a dated block: files touched, what changed, why,
> and any migration notes.

---

## 2026-07-17 — Phase 1: Core spine (backend)

**What changed**
- Bootstrapped the repo: npm workspaces, `apps/api` (Fastify + TypeScript + Prisma), Vitest,
  `.env.example`, `docker-compose.yml`, README runbook, and this changelog + `DECISIONS.md`.
- **Data model (PRD §4):** Prisma schema with all 11 tables using the exact PRD table/column
  names (`@@map`/`@map`), all enums, and indexes on FKs, `tenant_id`, `status`, `updated_at`.
  First migration committed.
- **Auth / roles / tenancy (PRD §2):** bcryptjs password hashing, signed HTTP-only session
  cookie, `authenticate` → `tenantScope` → `requireRole` middleware chain. Client-supplied
  `tenant_id` is never trusted for non-super-admins.
- **P0-2 State machine:** single pure `transition(ticket, event)` with an explicit table;
  writes `ticket_events` (append-only) and emits realtime events on every committed change;
  sets `first_response_at` / `resolved_at`; forbids reopen-after-closed (new ticket instead).
- **P0-4 Assignment + collision:** atomic conditional `UPDATE` claim (409 with current holder
  on contention), 10-minute stale-lock takeover, lock heartbeat, release-on-resolve/logout,
  realtime `lock.changed` broadcast, and reply auto-claim on `new`/`handoff`.
- **P0-3 Handoff:** low-confidence / user-request / manual / loop-guard triggers, localized
  holding message to the end user, internal handoff-summary note (`meta.internal=true`),
  `handoff_reason` recorded, handoff queue ordering (priority then age), inbox badge = new+handoff.
- **EVA / AI layer (PRD §6, partial — L1 complete):** `AIProvider` interface with
  `LabelAnswerProvider` (L1, full keyword match + hit_count), `LocalLLMProvider` (L2,
  OpenAI-compatible, auto-disables without `L2_BASE_URL`), `ClaudeProvider` (L3, Anthropic
  Messages API, needs `ANTHROPIC_API_KEY`). Three-layer router with per-layer `routing_logs`
  (latency + configurable unit cost), prompt-injection stripping, language detect (zh/en/ms),
  and KB full-text retrieval that excludes non-`synced` articles.
- **REST surface (PRD §8):** auth, tickets (list/detail/claim/release/messages/handoff/
  resolve/reopen), eva-config, label-answers CRUD, kb-articles CRUD, channels CRUD (redacted),
  metrics (summary/routing/timeseries), Telegram webhook + LiveChat inbound stubs.
- **Realtime:** `/realtime?tenant=:t` WebSocket, tenant-filtered `ticket.updated`,
  `message.created`, `lock.changed`.
- **Seed:** reproduces the prototype's 6 tickets (with threads), 6 KB articles, 3 tenants,
  agents (Kendrick Chan, KC Lim), EVA configs, label answers, and human-request keywords.
- **Tests (PRD §0.6):** state-machine unit tests (every legal transition + ≥8 illegal +
  fast-check property test), P0-4 concurrency race (100 rounds, exactly-one-winner +
  stale-lock takeover), auth/tenancy, ticket/message API, handoff e2e, and L1 routing.

**Migration notes**
- Initial migration `0001_init` creates all tables from empty; no destructive operations.
- Requires `DATABASE_URL` (Postgres 15+). Run `npm -w @icrm/api run db:migrate && npm -w @icrm/api run db:seed`.

## 2026-07-17 — Phase 3: Console (React) + tenants route + seed ordering

**What changed**
- **`apps/web`** — React 18 + TypeScript + Vite + Tailwind console recreating the Aurora
  Phantom prototype: Inbox (filters/search, lifecycle strip, collision banner + disabled
  compose, message bubbles incl. amber-dashed 内部备注, 转人工/发送/标记解决/重新打开 wired to the
  state machine, lock heartbeat, WebSocket live updates), EVA 助手配置 (L1/L2/L3 toggles,
  threshold slider, model/tone/signature, channel status, label-answer CRUD table,
  tenant_admin-gated), 知识库 (search, markdown CRUD, sync_status control, "excluded from
  EVA" indicator), 监控 (day/7d/30d cards, 14-day AI-vs-human line chart, routing bars,
  agent presence). All strings in `src/locale.ts` (zh primary, en secondary).
- **API:** added `GET /tenants` (tenant switcher; super_admin sees all, others their own)
  + test.
- **Seed:** prototype tickets get explicit near-now `updated_at`; monitor history moved to
  days 1–14 ago so first boot shows the prototype threads on top (DEC-013).
- **E2E:** Playwright smoke (`apps/web/e2e/smoke.spec.ts`) covering the Phase 3 gate:
  login → claim via reply → collision banner in a second session → resolve → monitor
  renders real metrics. Run with `npm run test:e2e`.

**Migration notes:** none (no schema changes). Reseed to get the new ordering:
`npm -w @icrm/api run db:seed`.

## 2026-07-20 — v2 upgrade batch 1: the P0 set from the product review

Implements the P0 layer of `docs/product-review/` (06-feature-priorities): the release
blockers and operability fixes found in the hands-on audit.

**Backend**
- **Outbound delivery (P0-1, fixes B-00):** `modules/outbound/` adapter layer — Telegram
  `sendMessage` (bot token from encrypted channel config, 8s timeout, retryable-error
  classification), LiveChat widget delivery + new public thread-poll endpoint
  `GET /webhooks/livechat/:channelId/thread`; widget script now polls for replies.
  Messages carry `delivery_status/delivery_error/delivered_at`; manual retry endpoint
  `POST .../messages/:id/retry-delivery`; maintenance worker sweeps stuck deliveries.
  Unsupported channels (email for now) record honest terminal failures.
- **Inbox operability (P0-2, fixes B-01/B-03/B-12/B-22):** default list = active
  statuses; `done`/`closed` are explicit filters; cron close preserves `updated_at`;
  search covers message bodies, customer names, and `#number`; tickets get a
  human-readable serial `number`.
- **One-step takeover (⚫-5):** reply/claim on `ai` tickets runs handoff+claim through
  the existing state machine.
- **Internal notes (P1-4):** `POST .../messages {internal:true}` — no lock, no
  transition, never delivered, hidden from the end-user thread (existing meta.internal
  mechanics + tests).
- **Customer 360° (P0-3):** `GET /tenants/:t/end-users/:id` — profile + cross-ticket
  history + per-status stats.
- **Users & security (P0-5, fixes B-15):** tenant-scoped user CRUD with `is_active`,
  self-service password change, login rate limiting (429 after 5 failures/15 min),
  deactivated accounts rejected at login and session load.
- **Real AI-layer health (P0-8, fixes B-04/B-13):** eva-config responses include per-layer
  `availability` (+reason) and env-driven `costs`.
- Migration `outbound_delivery_ticket_numbers_user_active`: DeliveryStatus enum +
  message delivery columns, `tickets.number` serial unique, `users.is_active`.

**Console (React)**
- Hash routing (P0-7, fixes B-06): refresh keeps your place; ticket deep links.
- Inbox: three-pane layout with customer 360° sidebar (profile, stats, clickable
  history); active/done/closed filters + load-more; priority pills + `#number`;
  delivery ticks per outbound message with inline retry; reply/internal-note compose
  modes; IME-safe Enter (fixes B-10); viewer role sees read-only controls (fixes B-07);
  接管此单 replaces the separate 转人工 button.
- Browser notifications + sound for new handoffs/customer messages (P0-4, fixes B-21),
  opt-in toggle in the top bar.
- KB: full-article read view for every console role (fixes B-08); delete confirms.
- EVA config: real per-layer health badges with reasons; costs from the API; threshold
  persists on change (keyboard/touch included, fixes B-09); decorative model options
  removed (fixes B-14); label-answer delete confirms (fixes B-11).
- New Settings page: user management (invite/role/deactivate) + change password.
- e2e smoke updated for the merged takeover button; suite green
  (`PLAYWRIGHT_CHROMIUM_PATH` documented for preinstalled-Chromium environments).

**Tests:** 96 passing (84 existing + 12 new covering outbound delivery/poll/retry,
inbox defaults/search/cron-sort fix, takeover, internal notes, end-user profile, user
management, rate limiting, layer health).

**Migration notes:** run `npx prisma migrate deploy && npx prisma generate`, then
reseed if you want prototype data (`npm -w @icrm/api run db:seed`).
