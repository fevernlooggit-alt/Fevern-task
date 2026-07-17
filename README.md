# iCRM — 极光幻影 / Aurora Phantom

A multi-tenant, AI-first customer-support platform for NTWorld products (Parallel World,
稀土 PWC, NTWorld official). EVA (她/she) answers players across channels through a
three-layer cost architecture, with a strict ticket lifecycle, AI-to-human handoff, and
collision-safe agent assignment.

> Built to the PRD in `iCRM PRD v1.0`. This repository currently ships **Phase 1 — Core
> spine (backend)** complete, plus the forward-looking scaffolding for Phases 2–4. See
> [Phase status](#phase-status).

---

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **1 — Core spine (backend)** | schema + migrations, auth/roles/tenancy, P0-2 state machine, ticket/message APIs, P0-4 assignment + collision, seed data, realtime events | ✅ **Done** (gate tests green) |
| **2 — Channels + EVA** | three-layer routing + P0-3 handoff + `routing_logs` (✅ core, L1 fully wired), Telegram webhook + LiveChat inbound (✅ minimal), email piping/IMAP (⏳ interfaces + worker seam) | ◑ Partial |
| **3 — Console (React)** | `apps/web` (React 18 + Vite + Tailwind) — Inbox / EVA 助手配置 / 知识库 / 监控, Aurora Phantom theme, realtime, collision banner | ✅ **Done** (Playwright gate green) |
| **4 — Hardening** | stale-lock cleanup + done→closed cron (✅), rate limits / creds audit / full locale pass (⏳) | ◑ Partial |

Gates met: Phase 1 — all P0-2 / P0-4 tests green; two-agent race passes 100 rounds (exactly one
winner, loser gets 409 + holder). Phase 3 — Playwright smoke: login → claim → reply → collision
banner in a second session → resolve; monitor renders real metrics (`npm run test:e2e`).

---

## Quickstart

### Option A — Docker (one command)

```bash
cp .env.example .env          # optionally set ANTHROPIC_API_KEY, L2_BASE_URL, secrets
docker compose up --build
# API on http://localhost:3000  (migrates + seeds automatically)
```

### Option B — Local

Requires Node 20+, PostgreSQL 15+, Redis 7.

```bash
npm install
cp .env.example apps/api/.env          # adjust DATABASE_URL / REDIS_URL if needed
createdb icrm && createdb icrm_test     # or use the URLs in .env
npm -w @icrm/api run db:migrate         # apply migrations
npm -w @icrm/api run db:seed            # load prototype fixtures
npm run dev                             # API on http://localhost:3000
npm -w @icrm/web run dev                # (separate shell) console on http://localhost:5173
npm -w @icrm/api run worker             # (separate shell) maintenance worker
```

Open http://localhost:5173 and log in with a seed account below — the inbox boots looking
like the Aurora Phantom prototype.

### Smoke check

```bash
curl localhost:3000/health
curl -c cookies -X POST localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"kendrick@parallelworld.example","password":"password123"}'
curl -b cookies 'localhost:3000/tenants/parallel-world/tickets?status=handoff'
```

---

## Seed logins

All seeded users share the dev password **`password123`**.

| Email | Role | Tenant |
|---|---|---|
| `boss@ntworld.example` | super_admin | (all) |
| `admin@parallelworld.example` | tenant_admin | Parallel World |
| `kendrick@parallelworld.example` | agent | Parallel World |
| `kclim@parallelworld.example` | agent | Parallel World |
| `qa@parallelworld.example` | viewer | Parallel World |
| `admin@pwc.example` | tenant_admin | 稀土 PWC |

Tenants (slugs): `parallel-world`, `rare-earth-pwc`, `ntworld`.

---

## Testing

```bash
npm test                    # full Vitest suite (needs Postgres; uses TEST_DATABASE_URL)
npm run test:e2e            # Playwright console smoke (reseeds, then drives the real UI)
npm -w @icrm/api run typecheck && npm -w @icrm/web run typecheck
```

Coverage highlights (PRD §0.6 — every route / transition tested, concurrency raced):

- **`state.test.ts`** — every legal transition, every illegal one, and a fast-check property
  test that random event sequences never reach an undefined state.
- **`collision.test.ts`** — P0-4: 100-round two-agent race (exactly one winner), API 409 +
  holder, stale-lock takeover (audited), fresh-lock protection.
- **`auth.test.ts`** — login/cookie, cross-tenant 403, super_admin cross-tenant, role guards,
  logout releases locks.
- **`tickets.test.ts`** — auto-claim reply, collision 409, resolve, illegal transition 422,
  append-only events, reopen (done→human and closed→new linked ticket), list + badge.
- **`handoff.test.ts`** — P0-3 low-confidence + user-request handoff, internal summary note,
  localized holding message, handoff-filter visibility, internal-note hiding.
- **`routing.test.ts`** — L1 label-answer hit + `routing_logs`, all-disabled→handoff,
  idempotent re-delivery, language detect, injection guard.
- **`modules.test.ts`** — eva-config / label-answers / kb / channels CRUD (encryption +
  redaction), metrics, Telegram webhook, widget, heartbeat/release.
- **`maintenance.test.ts`** — done→closed cron, stale-lock cleanup.

---

## Architecture

```
apps/api                       Fastify + TypeScript + Prisma (REST + WebSocket + worker)
  src/state/machine.ts         P0-2 pure transition() + explicit table (single source of truth)
  src/state/service.ts         the ONE DB funnel: transition → ticket_events → realtime
  src/modules/tickets/locking  P0-4 atomic conditional-UPDATE claim / heartbeat / takeover
  src/modules/eva/*            AIProvider seam (L1 LabelAnswer, L2 LocalLLM, L3 Claude),
                               router (routing_logs), retrieval (KB), handoff (P0-3)
  src/realtime/*               in-process event bus + /realtime WebSocket (tenant-filtered)
  src/jobs/maintenance.ts      done→closed + stale-lock cleanup (run by src/worker.ts)
apps/web                       React 18 + Vite + Tailwind console (Aurora Phantom)
  src/pages/{Inbox,EvaConfig,Kb,Monitor}.tsx   the four PRD §7 modules
  src/locale.ts                all user-facing strings (zh primary, en secondary)
  e2e/smoke.spec.ts            Playwright Phase-3 gate
docs/DECISIONS.md              append-only decision log (PRD §0.2)
docs/CHANGELOG.md              append-only change log (PRD §0.3)
```

**Three-layer routing (PRD §6.1):** `L1 Label Answers → L2 Local LLM → L3 Claude → handoff`.
Each layer is per-tenant toggleable; every AI call is logged to `routing_logs` with latency +
configurable unit cost. `L2` auto-disables without `L2_BASE_URL`; `L3` requires
`ANTHROPIC_API_KEY` (default model `claude-sonnet-4-6`). End-user text is treated as data, not
instructions (prompt-injection guard). Non-`synced` KB articles are excluded from retrieval.

**Ticket lifecycle (PRD §5 P0-2):**
`new→ai`, `new→human`, `ai→handoff`, `ai→done`, `handoff→human`, `human→done`,
`done→human` (≤7d), `done→closed` (auto). `closed` is terminal; reopen-after-closed spawns a
new linked ticket. All status changes flow through one pure `transition()`.

---

## API surface (PRD §8)

```
POST   /auth/login | /auth/logout            GET /auth/me
GET    /tenants/:t/tickets?status=&q=&page=
GET    /tenants/:t/tickets/:id               (thread + events)
POST   /tenants/:t/tickets/:id/claim         (409 on collision)
POST   /tenants/:t/tickets/:id/release | /heartbeat
POST   /tenants/:t/tickets/:id/messages      (auto-claim)
POST   /tenants/:t/tickets/:id/handoff | /resolve | /reopen
GET/PUT /tenants/:t/eva-config
CRUD   /tenants/:t/label-answers | /kb-articles | /channels
GET    /tenants/:t/metrics/summary?range= | /metrics/routing | /metrics/timeseries
POST   /webhooks/telegram/:channelId | /webhooks/livechat/:channelId
GET    /widget/:channelId.js
WS     /realtime?tenant=:t                   (ticket.updated | message.created | lock.changed)
```

Errors use `{ error: { code, message, details? } }` — 409 for collisions, 422 for illegal
transitions.

---

## Configuration

All secrets come from the environment; see [`.env.example`](.env.example). Key vars:
`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` (AES-256-GCM, 32 bytes),
`ANTHROPIC_API_KEY`, `L2_BASE_URL`, `LOCK_TTL_MINUTES`, cost overrides `COST_L1/L2/L3`.

## Design decisions & change history

- [`docs/DECISIONS.md`](docs/DECISIONS.md) — every non-obvious choice, with rationale.
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — dated, append-only change log.

## Roadmap (remaining)

- **Phase 2:** IMAP/SMTP email piping over BullMQ (interfaces + worker seam are in place),
  richer L2/L3 integration tests behind mocked providers.
- **Phase 4:** rate limiting, credential-audit tooling, en locale toggle in the console,
  Redis pub/sub realtime for horizontal scale, web service in docker-compose.
