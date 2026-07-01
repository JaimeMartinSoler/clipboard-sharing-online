# Implementation Prompt

Copy the block below into a fresh Claude Code session (in this repo) to build the
app. It assumes `CLAUDE.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, and
`docs/SECURITY.md` are already present and authoritative.

---

> Build **Clipboard Sharing Online** as specified in `CLAUDE.md`, `docs/SPEC.md`,
> `docs/ARCHITECTURE.md`, and `docs/SECURITY.md`. Read all four first and treat
> them as the source of truth; if you find a contradiction or a gap, stop and ask
> before coding.
>
> **Non-negotiables (from `docs/SECURITY.md`):** the password, derived keys, and
> plaintext must never leave the browser. The server stores only `room_id`,
> `ciphertext`, `iv`, and timestamps. Encrypt before any network call. Text only.
> Ephemeral TTL. No live sync — explicit **Push**/**Pull** only.
>
> **Match the look & conventions of `office-tools-online`** (read its repo at
> `../office-tools-online` for reference): Next.js 15 App Router + static export,
> TypeScript strict (no `any`), Tailwind v4, shadcn-style primitives, the single
> always-on `StatusBanner` (`error > warning > info > validated`), on-hover
> `Hint` tooltips, dark mode, the `Result<T>` pattern, and co-located Vitest
> tests. As a single-tool app, omit the multi-tool sidebar/registry.
>
> Follow `.claude/rules/git-branching.md`: branch off `develop` first. Work in
> these stages, running `pnpm test` / `pnpm lint` (and `pnpm build` for the
> frontend) at the end of each, and pausing for my review between stages:
>
> 1. **Scaffold the monorepo.** Next.js app at the repo root (mirroring
>    `office-tools-online`'s config: `next.config.mjs` with `output:'export'`,
>    `images.unoptimized`, and the hashFunction workaround; Tailwind v4; ESLint;
>    Vitest; `tsconfig` strict). Add `pnpm-workspace.yaml` with `worker` as a
>    second package and the needed `onlyBuiltDependencies`/`allowBuilds`
>    (esbuild, sharp, workerd, …). Confirm `pnpm install`, `pnpm build` → `./out`,
>    and `pnpm lint` all pass clean. No app logic yet.
>
> 2. **Crypto core (`src/lib/crypto.ts`) — TDD.** Implement `deriveKeys`,
>    `encrypt`, `decrypt` exactly as in `docs/ARCHITECTURE.md` (Argon2id via
>    `hash-wasm`, HKDF split into `room_id` + non-extractable AES-GCM-256 key,
>    random 96-bit iv, base64url). Write tests first: round-trip, wrong-password
>    fails (returns a `Result` error, never throws or leaks), determinism of
>    `room_id` per password and divergence across passwords, unicode, and
>    base64url edge cases. Keep Argon2id params in one constant with a test that
>    guards against weakening them. Pure module — no React/DOM.
>
> 3. **Worker API — clipboard routes (`worker/`) — TDD.** Hono app with the
>    `/api/clipboard*` routes from `docs/ARCHITECTURE.md`, D1 binding,
>    `migrations/0001_init.sql` (the full `rooms` + `members` schema), size cap,
>    rate limiting, lazy expiry on read, and a cron sweep. `wrangler.toml` with
>    the D1 binding, the `/api/*` route, the cron trigger, and `TTL`/size vars.
>    (Bearer-token enforcement is added in stage 4.) Test with
>    `@cloudflare/vitest-pool-workers` against a local D1: upsert→get round-trip,
>    404 on missing/expired (no existence oracle), size-cap rejection, DELETE
>    idempotency, cron sweep. Verify `pnpm --filter worker dev` serves locally.
>
> 4. **Room membership & sealing (`worker/`) — TDD.** Add `POST /api/rooms`:
>    atomic slot allocation in a D1 transaction (create room with `capacity`
>    default 2, clamped 1–10, on first contact; grant a slot only while
>    `members < capacity`); seal at capacity with `409`; `400` on bad `capacity`.
>    Generate a random bearer token, store only its SHA-256 hash in `members`,
>    return the raw token once. Gate all `/api/clipboard*` ops on a valid
>    `Authorization: Bearer <token>` bound to the room (`401` otherwise), and make
>    the cron sweep delete a room's `members` with it. Tests: concurrent joins
>    never over-seal past `capacity`, `409` once sealed, `400` on bad capacity,
>    `401` on clipboard ops without/with a wrong token, and expiry clearing
>    members. Crypto/key derivation must be untouched by this stage.
>
> 5. **API client (`src/lib/api.ts`).** Typed, same-origin `fetch` wrapper
>    returning `Result<T>`; `joinRoom(roomId, capacity)` plus push/pull/clear that
>    attach the in-memory Bearer token. Handles 401/404/409/413/network errors as
>    `Result` errors. Unit-tested with a mocked fetch.
>
> 6. **UI (`src/app/page.tsx` + components).** The single-screen tool: password
>    field (show/hide + strength meter), a **terminals** selector (default 2), a
>    **Join** action, a text editor pane, action bar (Push / Pull / Copy / Clear,
>    enabled only after joining), the always-on `StatusBanner` with the messages
>    from `docs/SPEC.md` (joined N of M, sealed, no free slot, slot-lost lockout,
>    pushed/pulled, decrypt-fail), an expiry countdown after push/pull, the
>    "🔒 End-to-end encrypted" badge, app shell/header/theme toggle matching
>    `office-tools-online`, and a `/privacy` page explaining the model (incl. the
>    seal + strict-slot behavior). Hold the membership token in memory only (no
>    localStorage). Wire Join = `POST /api/rooms`, Push = encrypt→`POST`,
>    Pull = `GET`→decrypt, Clear = `DELETE` + reset. Add `public/_headers` with
>    the strict CSP from `docs/ARCHITECTURE.md`.
>
> 7. **Docs & polish.** Write `README.md` in the spirit of
>    `office-tools-online`'s (what it is, the privacy story, tech stack, getting
>    started for both packages, deploy notes for Pages + Worker + D1 migrations).
>    Update `.github/workflows` to also test/lint the worker and to deploy it
>    (Wrangler) with D1 migrations. Re-read `.claude/rules/update-docs.md` and fix
>    any stale references.
>
> When everything is green (`pnpm -r test`, `pnpm lint`, `pnpm build`), follow
> `.claude/rules/git-commit-push-pr.md` to open a PR into `develop` — but ask me
> before committing. Report the exact commands you ran and their results, and
> call out anything you couldn't verify in this environment (e.g. real Cloudflare
> deploy / D1 binding).

---

## Notes for whoever runs this
- One-time Cloudflare setup (outside the code): create the D1 database
  (`wrangler d1 create clipboard-sharing-online`), put its `database_id` in
  `worker/wrangler.toml`, set the `CLOUDFLARE_*` GitHub secrets used by the
  deploy workflows, and bind the Worker route to `/api/*` on the Pages custom
  domain so the API is same-origin.
- The frontend has **no** secrets or bindings — keep it that way. Everything
  privileged lives on the Worker.
- If you want the stronger threat model later, see "Optional hardening" in
  `docs/SECURITY.md` (room name + password).
