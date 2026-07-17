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
