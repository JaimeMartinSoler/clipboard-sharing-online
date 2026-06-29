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
  and the Cloudflare Web Analytics origin. No third-party egress of any kind.
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
    Cloudflare **D1** database. Deployed with Wrangler.
- **Crypto (client only).** `Argon2id(password, fixed app salt)` → master key
  material (via `hash-wasm`); `HKDF` splits it into a deterministic `room_id`
  and an AES-GCM-256 content key. A fresh random 96-bit `iv` per push. Because
  there is no exchanged per-user salt, the app salt is fixed and determinism is
  what lets two terminals meet on the password alone — see the threat model and
  its mitigations in `docs/SECURITY.md`. The UI must nudge users toward strong
  passphrases.
- **No live sync.** The user drives sharing with explicit **Push** (encrypt →
  upload, replacing the room's blob) and **Pull** (download → decrypt) buttons.
- **Terminal cap (seal-on-full).** The room creator sets `capacity` (default 2,
  clamped 1–10). Terminals **join** to claim a slot; when full the room is
  **sealed** — no further join, ever, for that room instance. This is a
  defense-in-depth access layer on top of the E2EE (see `docs/SECURITY.md`),
  never a substitute. Slot allocation is **atomic** (D1 transaction, no
  over-seal). Joining returns a random bearer **token**; the server stores only
  its **SHA-256 hash**. The client keeps the token **in memory only** — strict,
  no persistence: a reload/closed tab forfeits the slot (it still counts against
  the cap, so a sealed room locks the user out until TTL).
- **API surface** (`worker/`): `POST /api/rooms` (join/create, atomic slot
  allocation, `409` when sealed, returns `{token, joined, capacity, sealed}`);
  `POST /api/clipboard` (upsert ciphertext+iv, set `expires_at`); `GET
  /api/clipboard/:roomId` (fetch latest, 404 if missing/expired); `DELETE
  /api/clipboard/:roomId` (clear). All three clipboard ops **require the Bearer
  membership token** (`401` otherwise). Serve the API under the same custom
  domain as Pages (`/api/*` route) so it is **same-origin** — no CORS. Document a
  CORS allowlist fallback if hosted on `*.workers.dev`.
- **D1 schema.** `rooms`: `room_id` (PK, opaque), `capacity`, `ciphertext`/`iv`
  (nullable until first push), `created_at`, `expires_at`. `members`: `id`,
  `room_id`, `token_hash`, `joined_at`. Sealed ⇔ member count ≥ capacity.
  `INSERT OR REPLACE` on push; index `expires_at` and `members.room_id`. Room,
  members, and blob expire together (lazy delete + cron).

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
  "🔒 End-to-end encrypted — your password never leaves this browser" badge, and
  a `/privacy` page. As a single-tool app, drop the multi-tool sidebar/registry
  scaffolding.

## Commands
- Frontend (root): `pnpm dev` / `pnpm build` (→ `./out`) / `pnpm test` / `pnpm lint`.
- Worker: `pnpm --filter worker dev` (local Wrangler + D1), `--filter worker test`,
  `--filter worker deploy`. Apply migrations with
  `pnpm --filter worker exec wrangler d1 migrations apply`.
- Aggregate: `pnpm -r test` runs both packages' suites.
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
- **Worker** → Wrangler (`wrangler deploy`); add a deploy step/workflow and run
  D1 migrations as part of release. The Worker holds the `CLOUDFLARE`/D1 bindings;
  the frontend holds none — it has no secrets to leak.
