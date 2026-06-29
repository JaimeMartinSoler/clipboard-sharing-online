# Product Spec — Clipboard Sharing Online

## Vision
A fast, **zero-knowledge** way to move a piece of **text** between your own
devices (or to someone you trust) using nothing but a shared **password**. You
type a password on two terminals, paste text and **Push** on one, **Pull** on
the other — and the text appears. The server that relays it can never read it.

It is the security-first sibling of `office-tools-online`. That app guarantees
privacy by having **no backend at all**; this app *must* relay data between
devices, so instead it guarantees privacy by **end-to-end encryption**: the
password and every derived key live only in the browser, and the backend stores
ciphertext it has no way to decrypt.

## Principles
1. **Privacy by cryptography.** The server is a dumb store of opaque encrypted
   blobs. Plaintext, the password, and all derived keys never leave the browser.
2. **Agreement by password alone.** No accounts, no room codes to exchange, no
   QR pairing. Two terminals that type the same password reach the same room.
3. **Ephemeral.** Shared data auto-expires quickly; nothing lingers.
4. **Explicit, not magic.** The user pushes and pulls on demand with buttons —
   no background sync, no surprise network activity.
5. **Visual & UX parity** with `office-tools-online`: same look, the single
   always-on status banner, on-hover hints, dark mode, a clear privacy story.

## How it works (user's mental model)
1. Open the site on two devices.
2. Type the **same password** on both (a passphrase — strength matters; see
   Security). On the first device, optionally set **how many terminals** may share
   this room (default **2**: this one + the joiner).
3. **Join** the room on both devices. Joining claims a slot; once the room is
   full it is **sealed** — no further terminal can ever join *that* room. Push and
   Pull unlock only after you've joined.
4. On device A: paste/type text → **Push** (the text is encrypted in the browser
   and uploaded).
5. On device B: **Pull** (the encrypted blob is downloaded and decrypted in the
   browser). The text appears. A wrong password simply fails to decrypt — the
   server gives the same answer either way.
6. The shared blob (and the whole room, with its seal and memberships) expires
   automatically; **Clear** removes the blob immediately.

> **Strict slots (intentional).** Your membership lives only in the page while
> it's open. If you reload, close the tab, or open a new browser, that slot is
> **gone** — it still counts against the cap, so on a sealed room you'll be
> locked out of your own room until it expires. Set the terminal count to match
> the devices you actually intend to use, and keep the tabs open.

## v1 Scope
- **Single screen** that is the tool itself (no multi-tool grid/sidebar).
- Password field (with show/hide and a strength meter), a **terminals** selector
  (default 2), a **Join** action, a text editor pane, and **Push** / **Pull** /
  **Copy** / **Clear** actions (the latter enabled only after joining).
- Client-side AES-GCM-256 encryption; password-derived deterministic room id +
  content key (see `docs/ARCHITECTURE.md` and `docs/SECURITY.md`).
- A Cloudflare Worker + D1 backend storing only `{room_id, capacity, ciphertext,
  iv, created_at, expires_at}` plus `members` (room_id + token **hash**), with a
  short TTL, lazy expiry on read, and a cleanup cron. The cap (seal-on-full) is a
  defense-in-depth access layer on top of the encryption.
- A persistent `StatusBanner` with live feedback (`error > warning > info >
  validated`): e.g. *"Joined as terminal 1 of 2 — waiting for 1 more"*, *"Room
  sealed (2/2) — sharing is locked to these terminals"*, *"Room is sealed — no
  free slot"*, *"Your slot was lost (reload/closed) — locked out until this room
  expires"*, *"Encrypted & pushed — expires in 10 min"*, *"Pulled & decrypted"*,
  *"No data in this room (or wrong password)"*, *"Couldn't decrypt — check the
  password"*.
- A visible **🔒 End-to-end encrypted** badge and a `/privacy` page explaining
  the model in plain language (and inviting the user to inspect the Network tab:
  only ciphertext goes out).

## Global UX requirements
- One input pane, a clear action bar (Push, Pull, Copy, Clear), and exactly one
  always-present status line so the layout never jumps.
- Controls carry on-hover tooltips; mode-dependent controls are
  disabled/grayed, never hidden.
- Show the room's expiry countdown after a successful push/pull.
- Never reveal whether a room "exists" beyond what a legitimate user needs: a
  failed pull and a wrong-password pull look the same to the user and identical
  on the wire.

## Configurable (sane defaults, document them)
- **Terminals (capacity):** default **2**; clamped to a small range (1–10). Set
  by whoever joins first; the room seals at this count.
- **TTL:** default ~10 minutes; offer a small fixed set (e.g. 1 min / 10 min /
  1 hour) — shorter is safer.
- **Max payload:** cap the *encrypted* size (e.g. 256 KB) and reject larger
  pushes with a clear error.

## Out of scope (v1)
- Live/real-time sync (no WebSockets, no polling loop — manual Push/Pull only).
- Files, images, or any non-text clipboard content (text only).
- Accounts, login, history, multi-item clipboards, or persistence beyond the TTL
  (room membership is anonymous, in-memory, and dies with the room — not an
  account).
- Sharing beyond the sealed set of terminals; no fan-out, no re-opening a sealed
  room.
- Membership persistence / rejoin after reload (strict by design — see above).

## Success criteria
- A reviewer can open DevTools and confirm **only ciphertext + iv + an opaque
  id** ever leave the browser — never the password or plaintext.
- Same password on two devices round-trips text correctly; a different password
  fails to decrypt and never corrupts or reveals the real content.
- A room seals at its capacity: once full, a further join is rejected, and a
  terminal that lost its slot cannot rejoin a sealed room before TTL.
- Stored rows (room + members + blob) disappear at/after their TTL.
