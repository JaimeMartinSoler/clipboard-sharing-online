# Clipboard Sharing Online

Share **text** between devices that agree on a single **password** — with the
server only ever holding **opaque ciphertext**. Same privacy ethos as its sister
repo `office-tools-online`, but where that app proves privacy with *no backend*,
this one proves it with *zero-knowledge encryption*: the password and all keys
are derived and used **only in the browser**; the backend stores an encrypted
blob it cannot read.

## Workflow (every new request, unless told otherwise)
1. **Verify the branch.** The base for new work is `develop`. If the current
   branch is not `develop`, stop and tell me before doing anything else.
2. **Branch off.** Create `<type>/<short-slug>` (`feature|fix|chore|docs|refactor`)
   for the request and do all work there. See `.claude/rules/git-branching.md`.
3. **Develop, don't publish.** Make changes and run `pnpm test` / `pnpm lint`
   on that branch. Do not commit, push, or open a PR yet.
4. **Hand off.** When done, follow `.claude/rules/git-commit-push-pr.md`: PRs
   target `develop`, never `main`.

Never push directly to `main` (`main` triggers the Cloudflare production deploy;
`develop` deploys to the staging slot).

## Inviolable constraints (security is the product)
- **Zero-knowledge server.** The password, the derived master key, the room key,
  and plaintext **never leave the browser** and are **never sent to the server**.
  The backend persists only: an opaque `room_id`, the AES-GCM `ciphertext`, the
  `iv`, and timestamps. If a change would send any of the forbidden values to the
  server, stop and flag it.
- **Encrypt before egress.** All content is encrypted client-side with WebCrypto
  AES-GCM-256 *before* any network call. The server is a dumb encrypted key/value
  store keyed by an opaque id.
- **Ephemeral by default.** Stored blobs carry a short TTL and auto-expire
  (lazy-delete on read + a cleanup cron). Do not add long-lived persistence.
- **HTTPS only, strict CSP.** `connect-src` allows only `'self'`/the API origin
  (including its explicit same-origin `wss://` hosts for live sync — never a
  bare `wss:`) and the Cloudflare Web Analytics origin. No third-party egress
  of any kind.
- **Bound the blast radius.** Enforce a max ciphertext size and per-IP rate
  limiting on the API. Text only in v1 — no file/blob upload.
- **Cap is layered on top of crypto, never instead of it.** Membership tokens are
  stored **only as hashes**; raw tokens are never persisted or logged. Slot
  allocation is **atomic**. `capacity`/membership must never influence key
  derivation or weaken the content E2EE.

## Architecture (see `docs/ARCHITECTURE.md` for detail)
- **Monorepo, two pnpm workspace packages:**
  - **root** — Next.js 15 (App Router) **static export** frontend → Cloudflare
    **Pages**. Same stack/conventions as `office-tools-online`. `pnpm build`
    emits `./out`.
  - **`worker/`** — Cloudflare **Worker** (TypeScript, Hono) API bound to a
    Cloudflare **D1** database, plus a per-room **Durable Object** (`RoomDO`,
    SQLite-backed class) for live-sync WebSocket fanout. Deployed with Wrangler
    (v4; tests are vitest 4 + `@cloudflare/vitest-pool-workers`'s
    `cloudflareTest()` plugin).
- **Crypto (client only).** `Argon2id(password, fixed app salt)` → master key
  material (via `hash-wasm`); `HKDF` splits it into a deterministic `room_id`
  and an AES-GCM-256 content key. A fresh random 96-bit `iv` per push. Because
  there is no exchanged per-user salt, the app salt is fixed and determinism is
  what lets two terminals meet on the password alone — see the threat model and
  its mitigations in `docs/SECURITY.md`. The UI must nudge users toward strong
  passphrases.
- **Three sync modes, fixed by the creator at creation** (`rooms.sync_mode`,
  returned to joiners by `POST /api/rooms`): **`manual`** — explicit **Push**
  (encrypt → upload, replacing the room's blob) and **Pull** (download →
  decrypt) buttons only, no WebSocket ever; **`push`** (UI default for new
  rooms) — explicit Push, but the other members receive it instantly over the
  live socket; **`typing`** — auto-push while typing (trailing 1s debounce,
  3s max-wait; the Push button becomes "Sync now"). Old clients that omit
  `syncMode` get `manual`, i.e. exact legacy behavior.
- **Live sync (Durable Object + WebSocket Hibernation).** One `RoomDO` per
  live room (`idFromName(roomId)`; manual rooms never instantiate one). The
  client opens `GET /api/rooms/:roomId/ws` with the bearer token in the
  `Sec-WebSocket-Protocol` list (`cso.v1, cso.bearer.<token>`) — **never a
  query string**, which would leak the raw token to edge logs. The Worker
  validates it against `members.token_hash` and forwards the upgrade with the
  token **stripped**; the DO sees only the hash, used to tag sockets
  (`serializeAttachment`) for echo suppression and revocation. Live-mode
  pushes route **through** the DO: it runs the same guarded D1 write and
  broadcasts `{v:1, type:"update", ciphertext, iv, expiresAt}` in one
  serialized turn — D1 stays the single source of truth, the DO stores nothing
  but an expiry alarm. Sockets hibernate ("ping" keepalives are auto-answered
  via `setWebSocketAutoResponse`). Close codes are terminal for the client:
  `4001` revoked (revoke also severs the member's sockets), `4004` room
  gone/expired. The frontend (`src/lib/live.ts`) is downstream-only, catches
  up with one HTTP pull per (re)connect, reconnects with capped backoff, and
  applies updates per a per-client conflict policy (`overwrite` default /
  `warn` keeps unsaved edits).
- **Create/Join roles + terminal cap (seal-on-full).** One device **creates** the
  room (`mode:"create"`, becomes the sole `creator`, sets `capacity`, default 2,
  clamped 1–6); others **join** (`mode:"join"`, `joiner`). When full the room is
  **sealed** (`rooms.sealed=1`, set atomically, **never reset**) — no further
  join, ever, for that room instance. This is a defense-in-depth access layer on
  top of the E2EE (see `docs/SECURITY.md`), never a substitute. Slot allocation
  is **atomic** (D1 transaction, no over-seal). Create/Join returns a random
  bearer **token**; the server stores only its **SHA-256 hash** + role. The client
  keeps the token **in memory only** — strict, no persistence: a reload/closed tab
  forfeits the slot (it still counts against the cap). The creator may **revoke** a
  joiner (deletes the member row) but the slot stays sealed and does not reopen.
- **API surface** (`worker/`): `POST /api/rooms` (`mode:"create"|"join"`,
  optional `syncMode` on create, atomic slot allocation, `409` when sealed / on
  a create collision, `404` joining a missing room, returns `{token, joined,
  capacity, sealed, role, syncMode}`); `POST /api/clipboard` (write
  ciphertext+iv + `expires_at` — direct to D1 for manual rooms, through the
  room's DO with broadcast for live rooms); `GET /api/clipboard/:roomId` (fetch
  latest, 404 if missing/expired); `DELETE /api/clipboard/:roomId` (clear);
  `GET /api/rooms/:roomId/ws` (WebSocket upgrade for live rooms — `426` no
  upgrade, `409` manual room) — all clipboard ops and the socket **require the
  Bearer membership token** (`401` otherwise). **Creator-only** (`403` for a
  joiner): `GET /api/rooms/:roomId/members` (list `{id, role, joinedAt}`, no
  IP/PII), `DELETE /api/rooms/:roomId/members/:id` (revoke a joiner + close
  their sockets), `DELETE /api/rooms/:roomId` (nuke room+members+blob + close
  all sockets). Serve the API under the same custom domain as Pages (`/api/*`
  route) so it is **same-origin** — no CORS; the CSP lists the `wss://` hosts
  explicitly. Document a CORS allowlist fallback if hosted on `*.workers.dev`.
  Local dev: Next's rewrite proxy can't carry WS upgrades, so `live.ts`
  connects straight to `ws://127.0.0.1:8787` on localhost.
- **Share links / auto-join.** The creator's Share button + QR encode
  `https://<origin>/#p=<base64url(password)>`. The password rides in the URL
  **fragment only** — never the path/query, which would leak it to the edge,
  analytics, and logs. The app auto-joins on load then scrubs the fragment. The
  QR uses a vendored, dependency-free encoder (`src/lib/qr.ts`) as inline SVG.
- **D1 schema.** `rooms`: `room_id` (PK, opaque), `capacity`, `sealed`,
  `sync_mode` (`'manual'|'push'|'typing'`, default `'manual'`),
  `ciphertext`/`iv` (nullable until first push), `created_at`, `expires_at`.
  `members`: `id`, `room_id`, `token_hash`, `role`, `joined_at`. Sealed ⇔
  `rooms.sealed=1` (set when member count first ≥ capacity; write-once).
  Push is a guarded `UPDATE … WHERE expires_at > now` (never resurrects);
  index `expires_at` and `members.room_id`. Room, members, and blob expire
  together (lazy delete + cron; the DO's alarm closes live sockets at TTL).
  Migrations: `0001_init.sql`, `0002_roles_sealed.sql`, `0003_sync_mode.sql`.

## Conventions
- TypeScript **strict**, no `any`. Pure logic returns `Result<T>`
  (`{ok:true,value}|{ok:false,error}`) and never throws on user input — surface
  errors in the UI. Crypto and API-client logic live in pure, unit-tested modules
  separate from React components.
- Co-locate a `*.test.ts` with every logic module. Crypto needs round-trip tests
  (encrypt→decrypt), wrong-password-fails tests, and determinism tests
  (same password ⇒ same `room_id`). The Worker is tested with
  `@cloudflare/vitest-pool-workers` against a local D1.
- Keep visual parity with `office-tools-online`: header, theme toggle, the panel
  aesthetic, the single always-on `StatusBanner`
  (`error > warning > info > validated`), on-hover `Hint` tooltips, a visible
  lock-icon "End-to-end encrypted — your password never leaves this browser"
  badge, and a `/privacy` page. As a single-tool app, drop the multi-tool
  sidebar/registry
  scaffolding.

## Commands
- Frontend (root): `pnpm dev` / `pnpm build` (→ `./out`) / `pnpm test` / `pnpm lint`.
- Worker: `pnpm --filter worker dev` (local Wrangler + D1), `--filter worker test`,
  `--filter worker deploy`. Apply migrations with
  `pnpm --filter worker exec wrangler d1 migrations apply`.
- Aggregate: `pnpm -r --include-workspace-root test` runs both packages' suites
  (plain `pnpm -r test` skips the root frontend package and runs only `worker`).
- Native build scripts (esbuild, sharp, workerd, …) must be allowlisted in
  `pnpm-workspace.yaml` (`onlyBuiltDependencies`/`allowBuilds`) or pnpm blocks
  them and install fails.
- **`next build` build-hasher workaround.** If `pnpm build` crashes inside
  webpack's hasher (`Cannot read properties of undefined (reading 'length')` /
  `ERR_INVALID_ARG_TYPE: "data" ... Received undefined`), it is the known
  Next/webpack bug, not your code. Fix is in `next.config.mjs`: override
  `config.output.hashFunction` with a crypto SHA-256 hash that no-ops on
  `undefined`/`null` updates. Keep that override; `pnpm test`/`lint` never hit it.

## Deploy
- **Frontend** → Cloudflare Pages via `.github/workflows/deploy.yml` (`main` =
  prod, other branches = the `develop` staging slot). Build output is `./out`.
- **Worker** → Wrangler via `.github/workflows/deploy-worker.yml` (`main` = prod
  on the top-level config; `develop` = an isolated staging Worker
  `clipboard-sharing-online-api-develop` with its own D1, via the `[env.develop]`
  block in `worker/wrangler.toml` and `wrangler deploy --env develop`). The
  workflow applies D1 migrations (`--remote`) before deploying. Each environment
  serves `/api/*` same-origin via a Worker route on its own custom domain
  (`clipboard-sharing-online.com`, `develop.clipboard-sharing-online.com`). The
  Worker holds the `CLOUDFLARE`/D1 bindings; the frontend holds none — it has no
  secrets to leak.
