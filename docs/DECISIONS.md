# DECISIONS — iCRM

> Append-only. Never edit or delete past entries. Each entry: ID, date, decision, rationale.
> This log exists because the PRD instructs: "if this document is silent, choose the simplest
> option that does not block future phases, and record the decision here."

---

### DEC-001 · 2026-07-17 · Backend framework = Fastify
PRD §3 permits Fastify or Express. Chose Fastify (the PRD default): first-class TypeScript,
built-in `.inject()` for fast route tests without a live socket, native schema validation,
and `@fastify/websocket` for the realtime requirement. No friction encountered.

### DEC-002 · 2026-07-17 · ORM = Prisma
PRD §3 permits Prisma or Drizzle. Chose Prisma: committed SQL migrations, generated
type-safe client, and `$transaction` with `SELECT ... FOR UPDATE`/conditional `UPDATE`
support needed for the P0-4 atomic-claim requirement. Table/column names are pinned to the
exact PRD §4 names via `@@map`/`@map`.

### DEC-003 · 2026-07-17 · Auth = stateless signed HTTP-only cookie
PRD §2 requires "email + password with session cookies (HTTP-only)" but §4 defines no
`sessions` table. Simplest non-blocking option: a signed (`@fastify/cookie`, HMAC secret from
`SESSION_SECRET`) HTTP-only, SameSite=Lax cookie carrying `{ userId }`. Logout clears the
cookie and flips `users.is_online=false`. A server-side session store (Redis) can be added
later without changing the route contract. Password hashing: see DEC-005.

### DEC-004 · 2026-07-17 · Realtime = @fastify/websocket + in-process event bus
PRD §3 allows WebSocket or SSE. Chose WebSocket via `@fastify/websocket`. Events
(`ticket.updated`, `message.created`, `lock.changed`) are published through a small in-process
`EventEmitter` bus and fanned out to sockets filtered by `tenant_id`. Single-instance only in
v1; a Redis pub/sub adapter is the documented seam for horizontal scale (Phase 4).

### DEC-005 · 2026-07-17 · Password hashing = bcryptjs
PRD §2 permits "bcrypt/argon2". Chose `bcryptjs` (pure-JS, zero native/build-tool
dependencies) so `npm install` is deterministic in any sandbox/CI without node-gyp or
prebuilt-binary downloads. Cost factor 10. If a native argon2id is desired later it can be
swapped behind the `hashPassword`/`verifyPassword` seam in `src/auth/password.ts`.

### DEC-006 · 2026-07-17 · State-machine events
The PRD §5 P0-2 lists transitions but not event names. Canonical event vocabulary:
`eva_pickup` (new→ai), `claim` (new→human, handoff→human), `handoff` (ai→handoff),
`resolve` (ai→done, human→done), `reopen` (done→human, ≤7 days), `close` (done→closed).
`closed` is terminal. All status changes flow through the single pure `transition()` function.

### DEC-007 · 2026-07-17 · L2/L3 provider availability degrades gracefully
Per Open Question #1: if `L2_BASE_URL` is unset at runtime, `LocalLLMProvider` reports
unavailable and L2 is skipped. `ClaudeProvider` (L3) reports unavailable when
`ANTHROPIC_API_KEY` is unset. When a required layer is unavailable the router falls through
to the next enabled layer, and to handoff if none can answer. Default L3 model
`claude-sonnet-4-6` (PRD §3).

### DEC-008 · 2026-07-17 · Channel credentials encrypted with AES-256-GCM
Per PRD §3, `channels.config_encrypted` is encrypted at rest with AES-256-GCM using
`ENCRYPTION_KEY` (32-byte key, hex or base64, from env). API responses never return decrypted
secrets — connection config is redacted to boolean "configured" flags.

### DEC-009 · 2026-07-17 · Attachment storage behind a driver
Per Open Question #2: a `Storage` interface with a local-disk driver (`STORAGE_DIR`) is the
v1 default; an S3 driver can be added behind the same interface without touching callers.

### DEC-010 · 2026-07-17 · Monorepo layout, api first
Repo uses npm workspaces (`apps/*`). Phase 1 ships `apps/api` (REST + WebSocket + worker
entrypoint). `apps/worker` shares the api build via the `worker` npm script and a distinct
docker-compose command; `apps/web` (React console) lands in Phase 3. docker-compose provisions
postgres, redis, api, and worker today; `web` is added with Phase 3.

### DEC-011 · 2026-07-17 · Human-request keyword list stored on eva_configs
PRD §5 P0-3.2 requires the human-request keyword set (`转人工`, `人工`, "human", "agent",
"manusia", …) to live in the DB and be editable. Rather than add a new table, it is a
`human_request_keywords String[]` column on `eva_configs` (one editable list per tenant,
co-located with the config the tenant_admin already edits). Migration
`add_human_request_keywords` adds the column non-destructively with the PRD's default set.
