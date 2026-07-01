# Clipboard Sharing Online

Share **text** between devices that agree on a single **password** — with the
server only ever holding **opaque ciphertext** it cannot read.

> 🔒 **End-to-end encrypted — your password never leaves the browser.**
> This isn't a policy promise; it's how the app is built. The password, every
> derived key, and your plaintext are computed and used **only in your browser**.
> The backend is a dumb encrypted key/value store: it sees an opaque room id,
> the AES-GCM ciphertext, the nonce, and timestamps — nothing it can decrypt.
> Open your browser's Network tab and see for yourself.

It is the security-first sibling of
[`office-tools-online`](https://github.com/JaimeMartinSoler/office-tools-online):
that app guarantees privacy by having **no backend at all**; this one *must*
relay data between devices, so instead it guarantees privacy with **zero-knowledge
encryption**.

## How it works

1. Open the site on two devices.
2. Type the **same password** on both (a long passphrase — strength matters).
   On the first device, optionally set **how many terminals** may share the room
   (default 2).
3. **Join** the room on both devices. Joining claims a slot; once full the room
   is **sealed** — no further terminal can ever join *that* room instance.
4. On device A: paste/type text → **Push** (encrypted in your browser, then
   uploaded).
5. On device B: **Pull** (the blob is downloaded and decrypted in your browser).
   A wrong password simply fails to decrypt — the server gives the same answer
   either way.
6. The blob (and the whole room) auto-expires after a short TTL; **Clear**
   removes it immediately.

### Crypto, in one paragraph

`Argon2id(password, fixed app salt)` derives 32 bytes of master key material
(via `hash-wasm`). `HKDF` splits that into a deterministic, opaque **`room_id`**
(the only key-derived value ever sent) and a non-extractable **AES-GCM-256
content key** (never sent). Each push uses a fresh random 96-bit `iv`; the GCM
tag makes tampering detectable. Because the only shared secret is the password,
derivation is deterministic and the salt is fixed — see
[`docs/SECURITY.md`](docs/SECURITY.md) for the threat model and mitigations
(memory-hard KDF, strong-passphrase nudging, short TTL, sealed rooms).

## Privacy by design

- **Encrypt before egress.** All content is AES-GCM-256 encrypted client-side
  *before* any network call.
- **Zero-knowledge server.** Stored columns: `room_id`, `capacity`,
  `ciphertext`, `iv`, `created_at`, `expires_at`, plus membership **token
  hashes** — never the password, keys, or plaintext.
- **Ephemeral.** Rooms, memberships, and blobs share one TTL and auto-expire
  (lazy delete on read + a cleanup cron).
- **Strict CSP.** [`public/_headers`](public/_headers) limits `connect-src` to
  `'self'` (the same-origin API) plus Cloudflare Web Analytics — no third-party
  egress of any kind.
- **Sealed rooms (defense-in-depth).** A capped, sealable room protects content
  against a *later* password compromise. It is access control on top of the
  encryption, never a substitute — and membership is strictly in-memory, so a
  reload forfeits the slot (see the privacy page).

## Tech stack

- [Next.js 15](https://nextjs.org/) (App Router) — **static export** → Cloudflare Pages
- [TypeScript](https://www.typescriptlang.org/) (strict, no `any`) + the `Result<T>` pattern
- [Tailwind CSS v4](https://tailwindcss.com/) + shadcn-style UI primitives
- [hash-wasm](https://github.com/Daninet/hash-wasm) (Argon2id) + WebCrypto (HKDF, AES-GCM)
- [Hono](https://hono.dev/) on a [Cloudflare Worker](https://workers.cloudflare.com/) bound to [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Vitest](https://vitest.dev/) (+ [`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/) for the Worker)
- [pnpm](https://pnpm.io/) workspaces

## Repository layout

```
.                       # package "clipboard-sharing-online": Next.js frontend
├─ src/
│  ├─ app/              # page.tsx (the tool), privacy/, layout.tsx
│  ├─ components/       # StatusBanner, Hint, ui/* primitives, the tool
│  └─ lib/              # result.ts, crypto.ts, api.ts, password-strength.ts (+ tests)
├─ public/_headers      # strict CSP
└─ worker/              # package "worker": Cloudflare Worker API
   ├─ src/{index,db}.ts # Hono app + D1 queries
   ├─ migrations/0001_init.sql
   ├─ wrangler.toml     # D1 binding, /api/* route, cron, vars
   └─ test/             # vitest-pool-workers against a local D1
```

## Getting started

**Prerequisites:** Node.js 22+ and pnpm 11 (`corepack enable pnpm`).

> **Build note:** `next build` would otherwise crash inside webpack's hasher
> (`Cannot read properties of undefined (reading 'length')`). The fix lives in
> [`next.config.mjs`](next.config.mjs) (a crypto SHA-256 `hashFunction` that
> no-ops on empty updates). Keep that override.

```bash
pnpm install

# Frontend (static export → ./out)
pnpm dev          # http://localhost:3000
pnpm build        # emits ./out
pnpm lint
pnpm test         # crypto + api + password-strength

# Worker API (local Wrangler + a simulated D1)
pnpm --filter worker exec wrangler d1 migrations apply clipboard-sharing-online --local
pnpm --filter worker dev          # http://127.0.0.1:8787
pnpm --filter worker test         # vitest-pool-workers against a local D1
pnpm --filter worker lint         # tsc --noEmit

# Both test suites at once
pnpm -r --include-workspace-root test
```

In production the Worker is bound to `/api/*` on the same custom domain as Pages,
so the browser talks to it **same-origin** (no CORS). For local development,
point the frontend at `http://127.0.0.1:8787` or run the two behind a single
origin.

## Deploy

The two environments are **fully decoupled** — each has its own frontend, Worker,
and D1, served **same-origin** on a single host (the Worker route takes precedence
over Pages for `/api/*`; everything else is the static export):

| Environment | Host | Frontend (Pages) | API (Worker route → D1) |
| --- | --- | --- | --- |
| production | `clipboard-sharing-online.com` | `main` branch | `…/api/*` → `clipboard-sharing-online-api` → `clipboard-sharing-online` D1 |
| develop | `develop.clipboard-sharing-online.com` | `develop` branch | `…/api/*` → `clipboard-sharing-online-api-develop` → `clipboard-sharing-online-develop` D1 |

The routes and D1 bindings are declared in
[`worker/wrangler.toml`](worker/wrangler.toml) (top level = prod, `[env.develop]`
= staging). The steps below are the one-time console/CLI setup that has to exist
for those declarations to have something to bind to.

### One-time Cloudflare setup

This is the exact sequence that gets a working, decoupled prod + develop. Do it
once; afterwards CI keeps both in sync.

**1. Own the domain in Cloudflare.** Add `clipboard-sharing-online.com` as a zone
(nameservers pointed at Cloudflare) so you can attach proxied hostnames and Worker
routes to it.

**2. Create the two D1 databases** and copy each printed `database_id` into
`worker/wrangler.toml` (prod → top-level `[[d1_databases]]`, develop →
`[[env.develop.d1_databases]]`):

```bash
pnpm --filter worker exec wrangler d1 create clipboard-sharing-online
pnpm --filter worker exec wrangler d1 create clipboard-sharing-online-develop
```

`database_id` is an identifier, not a secret — it is safe to commit. Access is
gated by the account-scoped API token, not by knowing the id.

**3. Create the API token** (My Profile → API Tokens → Create Custom Token) with
**all** of these — a token missing the zone scopes deploys the Worker but silently
fails to create its `/api/*` route:

| Scope | Type | Permission | Needed for |
| --- | --- | --- | --- |
| Workers Scripts | Account | Edit | Upload/deploy the Worker |
| D1 | Account | Edit | `d1 migrations apply --remote` |
| Cloudflare Pages | Account | Edit | Frontend Pages deploy |
| Workers Routes | Zone | Edit | Bind `…/api/*` to the Worker |
| Zone | Zone | Read | Resolve `zone_name` → zone id |
| Account Settings | Account | Read | List the account (usually auto-included) |

Scope Zone Resources to `clipboard-sharing-online.com`. Save it as the
`CLOUDFLARE_API_TOKEN` GitHub secret, alongside `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_PROJECT_NAME` (the Pages project).

**4. Wire production** (`clipboard-sharing-online.com`):

- Pages → your project → **Custom domains → add `clipboard-sharing-online.com`**.
  A Pages custom domain serves the project's **production branch** (`main`).
- Workers → `clipboard-sharing-online-api` → **Routes → add
  `clipboard-sharing-online.com/api/*`** (zone `clipboard-sharing-online.com`).
  This matches the `[[routes]]` block in `wrangler.toml`; adding it in the dash
  is equivalent and useful if a token ever deploys without the route scope.

**5. Wire develop** (`develop.clipboard-sharing-online.com`) — the tricky part.
Pages custom domains only serve the **production** branch, so to put the
**`develop`** branch on a custom subdomain you point the custom domain at the
branch's `*.pages.dev` alias:

- **DNS → add a proxied (orange-cloud) `CNAME`**: name `develop`, target
  `develop.clipboard-sharing-online.pages.dev` (the develop-branch alias). Proxied
  is required — Worker routes only fire on proxied hostnames.
- Pages → same project → **Custom domains → add
  `develop.clipboard-sharing-online.com`**. Combined with the CNAME above, Pages
  serves the **develop** branch on this host (not `main`), with a real edge cert
  (this is what clears the `522` you get from the CNAME alone).
- Workers → `clipboard-sharing-online-api-develop` → **Routes → add
  `develop.clipboard-sharing-online.com/api/*`** (zone
  `clipboard-sharing-online.com`), mirroring the `[[env.develop.routes]]` block.

**Test each host** (never the `*.pages.dev` URL — no Worker route covers it, so
its `/api/*` always `405`s):

```bash
# Expect a JSON body (e.g. 400), NOT a 405 — 405 means the request hit Pages,
# i.e. the Worker route isn't bound to that host.
curl -i -X POST https://clipboard-sharing-online.com/api/rooms \
  -H 'content-type: application/json' -d '{}'
curl -i -X POST https://develop.clipboard-sharing-online.com/api/rooms \
  -H 'content-type: application/json' -d '{}'
```

**Troubleshooting the two failures we hit:**

- **`405` on `POST /api/…`** — the request reached **Pages**, not the Worker.
  Static Pages only serves `GET`/`HEAD`, so a `POST` returns `405`. Cause: the
  Worker `/api/*` route isn't bound to that host (step 4/5), or you're browsing
  the `*.pages.dev` URL, which no route covers.
- **`522` on the root page** — Cloudflare can't serve the host because it isn't a
  registered **Pages custom domain** yet (the proxied CNAME alone isn't enough).
  Add it under Pages → Custom domains (step 5).

### CI workflows

- **Frontend → Cloudflare Pages** ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)):
  `main` = production, other branches = the `develop` staging slot. Output `./out`.
- **Worker → Wrangler** ([`.github/workflows/deploy-worker.yml`](.github/workflows/deploy-worker.yml)):
  applies D1 migrations (`--remote`) then `wrangler deploy`. `main` deploys the
  production Worker; `develop` deploys an isolated staging Worker
  (`clipboard-sharing-online-api-develop`) with its own D1 via `--env develop`
  (see the `[env.develop]` block in [`worker/wrangler.toml`](worker/wrangler.toml)).
- **CI** ([`.github/workflows/verify.yml`](.github/workflows/verify.yml)): runs
  frontend test/lint/build and the Worker test/typecheck on every PR.

All secrets and bindings live on the Worker; the frontend ships none.

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) — product spec & UX.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — crypto, API, D1 schema, expiry.
- [`docs/SECURITY.md`](docs/SECURITY.md) — guarantees, the fixed-salt trade-off, threat model.
