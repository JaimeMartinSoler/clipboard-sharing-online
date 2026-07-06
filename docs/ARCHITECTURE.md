# Architecture

## Overview
```
┌─────────────────────────────┐        HTTPS, same-origin        ┌──────────────────────────┐
│  Browser (Cloudflare Pages) │  ───────────────────────────▶   │  Cloudflare Worker (Hono) │
│                             │   POST /api/rooms                │                          │
│  • password → KDF → keys    │   { roomId, capacity, syncMode } │  • atomic slot allocate  │
│  • AES-GCM encrypt/decrypt  │  ◀── { token, joined, sealed }   │  • seal when full        │
│  • Join → token (in memory) │                                  │  • validate + size cap   │
│  • Push / Pull buttons      │   POST/GET /api/clipboard        │  • rate limit            │
│    (Authorization: Bearer)  │   Bearer <token>                 │  • D1 upsert / select    │
│  • plaintext NEVER leaves   │  ◀── { ciphertext, iv, exp }     │  • lazy-expire + cron    │
│                             │                                  └───────┬───────┬──────────┘
│  • live rooms: WebSocket    │   GET /api/rooms/:id/ws (Upgrade)        │       │
│    (ciphertext broadcasts   │  ◀═══════════════════════════════════╗   │  push │ (live rooms:
│     in, "ping" out)         │                                      ║   │       │  write via DO)
└─────────────────────────────┘                                  ┌────╨───▼───────▼─────────┐
                                                                 │  RoomDO (one per room)   │
                                                                 │  • holds the room's      │
                                                                 │    WebSockets (hibernated)│
                                                                 │  • D1 write + broadcast  │
                                                                 │    in one serialized turn │
                                                                 │  • expiry alarm only —   │
                                                                 │    no content storage    │
                                                                 └────────────┬─────────────┘
                                                                              │
                                                                      ┌───────▼─────────┐
                                                                      │  Cloudflare D1  │
                                                                      │ rooms + members │
                                                                      └─────────────────┘
```
The Worker, the Durable Object, and D1 see **only** opaque ids, ciphertext, and
opaque membership token hashes. All cryptography happens in the browser. The
terminal cap is an access-control layer *on top of* the encryption (see
`docs/SECURITY.md`), never a substitute for it.

## Repository layout (pnpm monorepo)
```
.                          # package "web": Next.js 15 static-export frontend
├─ src/
│  ├─ app/                 # App Router: page.tsx (the tool), privacy/, about/, layout.tsx
│  ├─ components/          # shared UI (StatusBanner, Hint, buttons, editor…)
│  │  └─ ui/               # shadcn-style primitives
│  └─ lib/
│     ├─ result.ts         # Result<T> type
│     ├─ crypto.ts         # KDF + AES-GCM (pure, WebCrypto + hash-wasm) + tests
│     ├─ api.ts            # typed fetch client for the Worker + tests
│     ├─ live.ts           # live-sync WebSocket client (reconnect, parse) + tests
│     ├─ debounce.ts       # trailing debounce w/ max-wait (typing mode) + tests
│     ├─ room-link.ts      # #p=… share-link encode/decode (fragment only) + tests
│     ├─ qr.ts             # vendored no-network QR→SVG encoder + tests
│     └─ datetime.ts       # YYYY-MM-DD HH:mm:SS formatter + tests
├─ next.config.mjs         # output:'export', images.unoptimized, hash workaround
├─ docs/                   # SPEC, ARCHITECTURE, SECURITY, IMPLEMENTATION_PROMPT
├─ pnpm-workspace.yaml     # packages: ['worker']; onlyBuiltDependencies/allowBuilds
└─ worker/                 # package "worker": Cloudflare Worker API
   ├─ src/index.ts         # Hono app + routes
   ├─ src/room-do.ts       # RoomDO: per-room WebSocket fanout (hibernated)
   ├─ src/bindings.ts      # env bindings shared by the app and the DO
   ├─ src/db.ts            # D1 queries
   ├─ migrations/          # 0001_init, 0002_roles_sealed, 0003_sync_mode
   ├─ wrangler.toml        # D1 + DO bindings, route, cron trigger, vars
   └─ test/                # @cloudflare/vitest-pool-workers tests
```
The Next app stays at the repo root so the existing
`.github/workflows/deploy.yml` (build → `./out` → Pages) and `verify.yml`
keep working unchanged. The Worker is a sibling workspace package.

## Cryptography (browser only)
All values below are computed with WebCrypto + `hash-wasm` (Argon2id) and never
transmitted except where noted.

1. **Master key material** — `Argon2id(password, salt = APP_SALT, params)` → 32
   bytes. `APP_SALT` is a fixed, public, app-wide constant. There is no exchanged
   per-user salt because the only shared secret is the password and derivation
   must be **deterministic** so two terminals independently land on the same room
   and key. The cost of that choice is analysed in `docs/SECURITY.md` (Argon2id
   memory-hardness + short TTL are the mitigations).
2. **Split via HKDF** of the master material into:
   - `room_id = base64url(HKDF-Expand(master, info="cso:room-id", 16 bytes))` —
     **the only key-derived value sent to the server**; it is opaque and reveals
     nothing about the password or content.
   - `contentKey = HKDF-Expand(master, info="cso:content-key", 32 bytes)` →
     imported as a non-extractable AES-GCM-256 `CryptoKey`. **Never sent.**
3. **Encrypt (Push)** — fresh random 96-bit `iv`; `ciphertext =
   AES-GCM-encrypt(contentKey, iv, utf8(plaintext))` (GCM tag included). Send
   `{ roomId, ciphertext, iv }` (ciphertext/iv base64url). Plaintext never sent.
4. **Decrypt (Pull)** — `GET /api/clipboard/:roomId` → `{ ciphertext, iv }`;
   `AES-GCM-decrypt(contentKey, iv, ciphertext)`. A wrong password produces a
   different `contentKey` and the GCM tag check fails → surfaced as "couldn't
   decrypt", indistinguishable from "wrong password".

`src/lib/crypto.ts` exposes pure functions: `deriveKeys(password) →
{roomId, contentKey}`, `encrypt(contentKey, plaintext) → {ciphertext, iv}`,
`decrypt(contentKey, {ciphertext, iv}) → Result<string>`. No React/DOM imports.

### Share links & auto-join (fragment only)
The **Share options** (a `ShareControls` section shown below the editor to
**every** member — creator and joiners alike, so anyone can invite another
device or re-copy the password) offer **Copy password** (to clipboard, without
revealing it), **Show password** (reveal inline), **Share link**, and **Show
QR**, each rendered with the icon pinned left and the label centered. A short
warning under the heading reminds that anyone with the password or link can
join. The **Share link** button opens the native share sheet
(`navigator.share` → WhatsApp, Messages, Copy, …) on mobile and falls back to
copying the link on desktop; both it and the **QR** encode
`https://<origin>/#p=<base64url(password)>`.
The password rides in the URL **fragment** (`#…`), the one part of a URL a
browser never puts on the wire — it is not in the HTTP request line and not
beaconed by Cloudflare Web Analytics. `base64url` is transport encoding only
(reversible): **sharing the link is sharing decryption ability**, exactly the
intent. On load the app reads `location.hash`, auto-joins (`mode:"join"`), and
immediately **scrubs the fragment** from the address bar (`history.replaceState`)
so it doesn't linger in history or on screen. The QR is produced by a vendored,
dependency-free encoder (`src/lib/qr.ts`) rendered as **inline SVG** — no network,
CSP-safe. See `src/lib/room-link.ts` and `docs/SECURITY.md`.

## API (Worker, Hono)
Same-origin under the Pages custom domain via a Worker route on `/api/*` (no
CORS). If deployed on `*.workers.dev` instead, add a strict CORS allowlist for
the Pages origin.

| Method & path                | Body / params · auth       | Behaviour |
| ---------------------------- | -------------------------- | --------- |
| `POST /api/rooms`            | `{ roomId, mode, capacity?, syncMode? }` | Obtain a slot. `mode:"create"` makes the caller the **creator** and sets `capacity` (default 2, clamped 1–10) and `syncMode` (`manual` \| `push` \| `typing`, default `manual` so old clients keep legacy semantics); `mode:"join"` (default if omitted) claims a **joiner** slot in an existing room. Slot granted only while `sealed=0 AND members < capacity`. Returns `{ token, joined, capacity, sealed, role, syncMode }` — the stored mode, so a joiner learns the creator's choice. `409` when sealed or on a create collision (`{exists:true}`); `404` when joining a room that doesn't exist; `400` on bad `mode`/`capacity`/`syncMode`. |
| `POST /api/clipboard`        | `{ roomId, ciphertext, iv }` · Bearer token | Validate token↔room, shape, and size cap; rate-limit. **Manual rooms**: write the blob to D1 directly with `expires_at=now+TTL`. **Live rooms**: the validated write is executed *inside the room's Durable Object*, which broadcasts `{ciphertext, iv, expiresAt}` to every other member's socket in the same serialized turn (the pusher's own sockets are skipped — echo suppression by token hash). Returns `{ ok, expiresAt }`. `401` without a valid token; `404` when the room is missing/expired. |
| `GET /api/rooms/:roomId/ws`  | Upgrade + `Sec-WebSocket-Protocol: cso.v1, cso.bearer.<token>` | **Live rooms only.** The bearer token rides in the subprotocol list (browsers can't set Authorization on a WebSocket; a query param would leak the raw token into edge logs). The Worker validates it against `members.token_hash`, **strips it**, and forwards the upgrade to the room's DO with only the token hash. `101` echoes subprotocol `cso.v1`. `426` without Upgrade, `401` bad/missing token, `404` missing/expired room, `409` manual room. Server→client frames: `{v:1, type:"update", ciphertext, iv, expiresAt}`; client→server only `"ping"` (auto-answered `"pong"` without waking the hibernated DO). Close codes: **4001** revoked, **4004** room gone/expired (terminal — the client must not reconnect). |
| `GET /api/clipboard/:roomId` | path `roomId` · Bearer token | Validate token↔room. Select where `room_id=? AND expires_at>now`. If expired, lazy-delete and return 404. Returns `{ ciphertext, iv, expiresAt }` or 404. `401` without a valid token. |
| `DELETE /api/clipboard/:roomId` | path `roomId` · Bearer token | Clear the blob. Always returns 204 (no existence oracle). `401` without a valid token. |
| `GET /api/rooms/:roomId/members` | path `roomId` · Bearer token | **Creator-only.** List members `[{ id, role, joinedAt }]` (no IP/PII). `401` non-member, `403` joiner. |
| `DELETE /api/rooms/:roomId/members/:id` | path · Bearer token | **Creator-only.** Revoke a joiner's token (its slot stays **sealed** — does not reopen). `200` ok, `400` if id targets the creator, `404` unknown id, `401`/`403` as above. |
| `DELETE /api/rooms/:roomId` | path `roomId` · Bearer token | **Creator-only.** Nuke the room, its members, and its blob. `204`. `401`/`403` as above. |

Cross-cutting: max ciphertext size (reject oversized with 413), per-IP rate
limiting (Cloudflare Rate Limiting rule and/or in-Worker counter), JSON-shape
validation, and uniform error responses that don't leak room existence.

### Live sync (RoomDO, one Durable Object per room)
- **Addressing & lifecycle.** `idFromName(roomId)`; created lazily on the first
  live-room socket or push — a `manual` room never instantiates one. The DO
  stores **no content**: its only durable state is an alarm at the room's
  `expires_at` (slid forward by connects and pushes), which closes all sockets
  with `4004` when the room dies. D1 remains the single source of truth.
- **Hibernation.** Sockets are accepted with `ctx.acceptWebSocket()` and tagged
  (`serializeAttachment`) with the member's token **hash**; keepalive pings are
  answered by `setWebSocketAutoResponse`. An idle room is evicted from memory
  while its sockets stay connected, so it accrues no duration billing.
- **Write path.** For live rooms the Worker validates everything (auth, shape,
  size, TTL clamp) then calls the DO, which runs the same D1 `UPDATE … WHERE
  expires_at > now` guard and broadcasts `{v:1, type:"update", …}` in one
  serialized turn — every member observes pushes in commit order, and an expired
  room can't be resurrected.
- **Roster nudges.** Membership changes also fan out over the same sockets as a
  data-less `{v:1, type:"roster"}` frame so a creator's **room controls update
  in near-real time**: the Worker calls the DO's `broadcastRoster()` when a
  joiner lands in a live room (`POST /api/rooms`) and on revoke. The frame
  carries **no** member data — the roster (roles, join times) stays creator-only
  behind `GET …/members`, which the client re-pulls on the nudge **and on every
  socket (re)connect**, so a nudge missed while the socket was down can't leave
  the list stale. Manual rooms get no DO and no nudges; their room controls
  refresh only via the Refresh button.
- **Revocation & nuke.** `DELETE …/members/:id` also closes that member's
  sockets (`4001`) and nudges the survivors' rosters; `DELETE /api/rooms/:roomId`
  closes all (`4004`).
- **Client behaviour** (`src/lib/live.ts`): downstream-only socket; on every
  (re)connect the app catches up with one HTTP pull; reconnects use capped
  exponential backoff + jitter and give up (with a visible warning) after a
  few attempts; `4001`/`4004` are terminal. Incoming `update` frames are
  decrypted locally and applied subject to a per-client conflict policy
  (`overwrite` default, or `warn` which keeps unsaved edits and points at Pull);
  a `roster` frame — and each (re)connect's catch-up — re-pulls the creator's
  member list.

### Membership, roles & sealing
- **Create vs join, enforced server-side.** `mode:"create"` inserts the sole
  `creator` (only into a room with no members yet — a second create on the same
  live `room_id` returns `409 {exists:true}`); `mode:"join"` inserts a `joiner`
  only into an existing, unsealed room. The role lives in `members.role` and
  gates the creator-only endpoints (a joiner gets `403`), never just the view.
- **Atomic slot allocation.** `POST /api/rooms` runs inside a D1 transaction so a
  slot is granted only when `sealed=0 AND (capacity=0 OR COUNT(members WHERE
  room_id) < capacity)`; two terminals racing for the last slot cannot both win
  (no over-seal, no TOCTOU).
- **Open rooms (`capacity = 0`).** A creator can opt out of the terminal cap
  entirely (the "Open room" toggle). `capacity = 0` bypasses the join count check
  and the seal step never fires (`… AND capacity > 0`), so `sealed` stays `0` and
  the room admits unlimited terminals for its lifetime. This relaxes only the
  seal-on-full access layer; the content E2EE, bearer tokens, size cap, and rate
  limit are untouched.
- **Tokens are bearer credentials.** On create/join the Worker generates a random,
  high-entropy token, stores only its **SHA-256 hash** in `members`, and returns
  the raw token once. The client keeps it **in memory only** (no localStorage —
  strict policy). Every clipboard op must present it; the Worker authorizes by
  hashing the presented token and matching a `members` row for that room.
- **Sealing is an explicit, permanent flag.** `rooms.sealed` flips to `1` the
  instant `members` first reaches `capacity` (same transaction as the insert) and
  is **never reset for that room instance**. Join checks `sealed=0`, so a creator
  **removing** a joiner (which drops the member count) does **not** reopen the
  slot — the revoked token simply stops authorizing. Further `POST /api/rooms`
  on a sealed room returns `409`. Sealing is revealed only to a caller who already
  knows the password (they derived `room_id`), so it is not an existence oracle.
- **Expiry clears everything together.** `rooms`, its `members`, and the blob
  share one `expires_at`; lazy delete on read and the cron sweep remove all of
  them, so a sealed room — and every membership in it — vanishes at TTL. Reusing
  the password afterwards yields a fresh, unsealed room.
- **Content stays E2E-encrypted regardless.** `capacity` is plaintext metadata,
  not a secret, and membership never touches the content key.

## Data model (Cloudflare D1)
```sql
-- worker/migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS rooms (
  room_id    TEXT    PRIMARY KEY,   -- opaque, client-derived (see crypto)
  capacity   INTEGER NOT NULL,      -- max terminals; default 2, 1–6; 0 = open (unbounded, never seals)
  ciphertext TEXT,                  -- base64url AES-GCM ciphertext (nullable until first push)
  iv         TEXT,                  -- base64url 96-bit nonce (nullable until first push)
  created_at INTEGER NOT NULL,      -- epoch ms
  expires_at INTEGER NOT NULL       -- epoch ms; row is dead once now > this
);
CREATE TABLE IF NOT EXISTS members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    TEXT    NOT NULL,      -- FK → rooms.room_id
  token_hash TEXT    NOT NULL,      -- SHA-256 of the bearer membership token
  joined_at  INTEGER NOT NULL       -- epoch ms
);
CREATE INDEX IF NOT EXISTS idx_members_room ON members(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_expires ON rooms(expires_at);

-- worker/migrations/0002_roles_sealed.sql  (issue #7)
ALTER TABLE rooms   ADD COLUMN sealed INTEGER NOT NULL DEFAULT 0;      -- 1 once full, never reset
ALTER TABLE members ADD COLUMN role   TEXT    NOT NULL DEFAULT 'joiner'; -- 'creator' | 'joiner'

-- worker/migrations/0003_sync_mode.sql  (live sync)
ALTER TABLE rooms ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'manual'; -- 'manual' | 'push' | 'typing'
```
One `rooms` row per room (latest clipboard only) plus one `members` row per
joined terminal — the first being the `creator`. A room is **sealed** once
`rooms.sealed = 1` (set when `capacity > 0 AND COUNT(members) >= capacity`, then
permanent so a removed joiner never reopens a slot); an **open room**
(`capacity = 0`) never seals. `ciphertext`/`iv` are null
between joining and the first push. D1's primary gives strongly consistent
reads, so a Push — and a freshly allocated slot — is visible to an immediate
follow-up request, the property KV could not guarantee.

## Expiry
- **Lazy:** every read filters on `expires_at > now` and deletes the room (and
  its `members`) if past.
- **Sweep:** a Wrangler **cron trigger** (e.g. every few minutes) runs
  `DELETE FROM rooms WHERE expires_at <= now` and the matching
  `DELETE FROM members WHERE room_id NOT IN (SELECT room_id FROM rooms)` so
  abandoned rooms and their memberships don't accrete. A sealed room's seal and
  slots disappear with it at TTL.

## Frontend (static export)
- `next.config.mjs`: `output: 'export'`, `images.unoptimized: true`, and the
  webpack `hashFunction` workaround (see CLAUDE.md). The static site is just
  assets + client JS that calls the Worker; there is no SSR of user data and no
  API route in the Next app.
- Strict CSP via Pages `public/_headers`: `default-src 'self'`; `connect-src`
  limited to `'self'` (same-origin API) + the Cloudflare Web Analytics origin +
  the two explicit same-origin `wss://` hosts for the live socket (prod and
  develop — listed explicitly rather than a bare `wss:`, which would allow
  arbitrary-host egress); nothing else.
- Local dev runs `pnpm dev` (Next) alongside `pnpm --filter worker dev`
  (wrangler). HTTP API calls go through the Next rewrite proxy to
  `127.0.0.1:8787`, but Next's dev proxy cannot carry WebSocket upgrades, so
  `src/lib/live.ts` connects the socket straight to `ws://127.0.0.1:8787` when
  running on a localhost host (CSP does not apply under `next dev`).

## Result type
```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```
Shared by crypto and API-client modules; UI renders the error in the
`StatusBanner` instead of throwing.

## Testing
- **Frontend (Vitest):** crypto round-trip, wrong-password-fails, determinism
  (`deriveKeys` is stable for a password and differs across passwords), base64url
  edge cases, unicode, and size-limit handling in the API client. Plus the API
  client's create/join `mode`, role, and creator-only calls (including its
  `syncMode` normalization: a create/join response with a missing or unknown
  `syncMode` — e.g. an older Worker build during a deploy skew — degrades to
  `manual` instead of crashing the room view); `room-link`
  fragment round-trip (password never in path/query); `qr` structural invariants
  (finder patterns, timing track, version selection); and the datetime formatter.
- **Worker (`@cloudflare/vitest-pool-workers`):** upsert→get round-trip against a
  local D1, 404 on missing/expired, size-cap rejection, DELETE idempotency, and
  the cron sweep removing expired rows. Plus membership: create/join roles, atomic
  cap enforcement (concurrent joins never over-seal past `capacity`), the explicit
  `sealed` flag surviving a revoke (removed joiner does not reopen the slot),
  `409` once sealed / on a create collision, `404` joining a missing room, `400`
  on bad `mode`/`capacity`, creator-only auth (`401` non-member, `403` joiner) on
  the members/revoke/delete-room endpoints, `401` on clipboard ops without a valid
  Bearer token, and the sweep deleting a room's `members` alongside it. Live
  sync (`test/live.test.ts`, real in-process WebSockets): the handshake matrix
  (`101` + subprotocol echo / `401` / `404` / `409` manual / `426`), fanout with
  echo suppression and the D1 write-through, no broadcast to an expired room,
  roster nudges fanning out on join/revoke (and never for a manual join),
  revoke closing exactly the revoked member's socket with `4001`, nuke closing
  all with `4004`, and manual rooms never instantiating a DO.

## Deployment
Two fully decoupled environments, each same-origin on one host (Worker route wins
for `/api/*`, Pages serves the rest):

| Env | Host | Frontend | Worker | D1 |
| --- | --- | --- | --- | --- |
| prod | `clipboard-sharing-online.com` | Pages `main` | `clipboard-sharing-online-api` | `clipboard-sharing-online` |
| develop | `develop.clipboard-sharing-online.com` | Pages `develop` | `clipboard-sharing-online-api-develop` | `clipboard-sharing-online-develop` |

- **Frontend:** `.github/workflows/deploy.yml` → Cloudflare Pages (`main` = prod,
  other branches = the `develop` staging slot), output `./out`.
- **Worker:** `.github/workflows/deploy-worker.yml` runs `wrangler d1 migrations
  apply --remote` then `wrangler deploy`. `main` uses the top-level `wrangler.toml`
  (prod Worker + D1 + route); `develop` uses `--env develop`, an isolated staging
  Worker + D1 + route declared under `[env.develop]`. Named-environment config is
  **not** inherited, so `d1_databases`/`triggers`/`vars`/`routes` are repeated
  there on purpose.
- **Same-origin hosts:** each host is a Pages custom domain plus a Worker `/api/*`
  route on that host. The develop custom domain serves the `develop` **branch**
  (not `main`) via a proxied `CNAME` to the branch's `*.pages.dev` alias — see the
  step-by-step recipe and troubleshooting (`405`/`522`) in the repo `README.md`.
- All secrets/bindings live on the Worker; the frontend ships none.
