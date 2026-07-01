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
pnpm --filter worker exec wrangler d1 migrations apply clipboard-sharing --local
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

### One-time Cloudflare setup

```bash
# Create the D1 database and copy its id into worker/wrangler.toml
pnpm --filter worker exec wrangler d1 create clipboard-sharing
```

Then set these GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_PROJECT_NAME` (Pages project). Bind the Worker route to `/api/*` on
the Pages custom domain so the API is same-origin.

### CI workflows

- **Frontend → Cloudflare Pages** ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)):
  `main` = production, other branches = the `develop` staging slot. Output `./out`.
- **Worker → Wrangler** ([`.github/workflows/deploy-worker.yml`](.github/workflows/deploy-worker.yml)):
  applies D1 migrations (`--remote`) then `wrangler deploy`.
- **CI** ([`.github/workflows/verify.yml`](.github/workflows/verify.yml)): runs
  frontend test/lint/build and the Worker test/typecheck on every PR.

All secrets and bindings live on the Worker; the frontend ships none.

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) — product spec & UX.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — crypto, API, D1 schema, expiry.
- [`docs/SECURITY.md`](docs/SECURITY.md) — guarantees, the fixed-salt trade-off, threat model.
