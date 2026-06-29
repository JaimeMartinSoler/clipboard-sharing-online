# Security Model & Threat Analysis

Security is the product. This document states what the system guarantees, what it
does **not**, the residual risks of the password-only design, and the mitigations.

## Guarantees
- **The server cannot read your data.** It stores only an opaque `room_id`, the
  AES-GCM `ciphertext`, the `iv`, timestamps, a `capacity` count, and opaque
  membership **token hashes**. The password, the derived master key, the content
  key, and the plaintext are computed and used **only in the browser** and are
  **never transmitted**.
- **Tamper-evident.** AES-GCM is authenticated encryption; any modification of
  the ciphertext (including by a malicious server) causes decryption to fail
  rather than yield altered plaintext.
- **No accounts, no PII.** There is nothing to log in with and nothing personal
  to leak. Rooms are anonymous and short-lived; "membership" is just an
  in-memory bearer token, not an identity.
- **Ephemeral.** Rooms, their memberships, and blobs auto-expire (lazy delete on
  read + cleanup cron), bounding the window in which any ciphertext exists at all.
- **Sealable.** A room can be capped at N terminals and **sealed** once full, so
  access is restricted to the terminals present at seal time (see below).

## Cryptographic design (recap)
- `Argon2id(password, APP_SALT)` → master key material (memory-hard, slow).
- `HKDF` splits master into a deterministic `room_id` (sent, opaque) and an
  AES-GCM-256 `contentKey` (never sent).
- Per-push random 96-bit `iv`; GCM tag authenticates each blob.
- See `docs/ARCHITECTURE.md` for exact info-strings and sizes.

## The central trade-off: password-only ⇒ fixed salt
Because the **only** shared secret between the two terminals is the password,
key derivation must be **deterministic** — both sides have to arrive at the same
`room_id` and `contentKey` without exchanging anything else. That rules out a
random per-user salt (there is nowhere to get it from before contact). We
therefore use a **fixed, public, app-wide `APP_SALT`**.

Consequence: the scheme has **no per-user salt**, so an attacker can attempt an
**offline dictionary / brute-force attack** against the password space, and a
single precomputation is reusable across all users (rainbow-table style), since
the salt is constant.

### Mitigations
1. **Memory-hard KDF.** Argon2id with deliberately high memory/time cost makes
   each guess expensive and GPU/ASIC parallelism costly — the primary defense.
   Tune parameters as high as UX tolerates and record them.
2. **Strong passphrases.** The UI must steer users to long, high-entropy
   passphrases (strength meter; discourage short/common passwords). A weak
   password is the dominant risk and no server-side measure can fix it.
3. **Short TTL.** Ciphertext exists only briefly, shrinking the window for any
   attack against data at rest.
4. **`room_id` ≠ `contentKey`.** Guessing or discovering a `room_id` only
   locates ciphertext; decrypting still requires deriving the content key from
   the password. Finding the room is not reading the data.
5. **Rate limiting + size caps** on the API blunt online enumeration and abuse.
6. **No existence oracle.** Missing room, expired room, and wrong-password all
   look the same to the client and on the wire (uniform 404 / decrypt-fail), so
   the API does not confirm "password X is in use".

## Terminal cap & sealing (defense-in-depth)
The room creator sets a maximum number of terminals (default 2). Terminals
**join** to claim a slot; when the room reaches capacity it is **sealed** and no
further terminal can join *that room instance*.

### What it buys
- Because `room_id` is derived from the password, joining a room **already
  requires knowing the password**. The cap therefore protects content against a
  **later** password compromise: if the legitimate terminals seal the room
  first, an attacker who learns or cracks the password *afterward* finds the room
  **sealed** and is locked out. Against the realistic offline-cracking attacker
  (hours/days) vs. a legitimate join (seconds), the legit terminals seal first
  essentially every time. This is the closest thing the design has to forward
  secrecy.

### What it does NOT do (be honest)
- **It does not fix the fixed-salt / weak-password risk.** A password guessable
  *online, fast enough to race the legitimate join* still wins. Passphrase
  strength + Argon2id cost + short TTL remain the primary defenses; the cap is
  layered on top, never a substitute.
- **"Sealed forever" is bounded to the room's TTL.** Room, members, and blob all
  expire together; reusing the same password afterward creates a fresh,
  **unsealed** room. The guarantee is "for this short-lived room instance", not
  eternity.
- **It is access control, not cryptography.** Anyone with direct DB access reads
  the ciphertext regardless of the cap — confidentiality of content still rests
  entirely on the encryption, not on the seal.

### New risks the cap introduces
- **Race / denial of service by a concurrent password-knower.** Someone who
  knows the password at the same time as you can claim the last slot (and read
  pushed content) or seal the room to **lock you out**. This requires knowing the
  password concurrently — a narrower threat than offline cracking — but it is a
  new *availability* failure mode the password-only-no-cap design did not have.
- **Self-lockout (strict policy).** Membership tokens live in memory only (no
  persistence). A reload, closed tab, or new browser forfeits the slot, which
  still counts against the cap — so a user can lock themselves out of their own
  sealed room until it expires. This is intentional, in service of seal
  integrity; the UI must make it obvious.

### Optional hardening (future, if the threat model demands it)
- Add an explicit **room name / share code** alongside the password (the
  "room name + password" model we considered): the room name locates the room
  and the password only encrypts, so guessing the password alone can't even find
  the ciphertext. This trades a little UX for defeating the precomputation risk,
  and pairs naturally with the cap (the code also gates who can join).
- Per-room random salt becomes possible the moment there's *any* second shared
  value to seed it.

## Out-of-scope threats (be honest about these)
- **Compromised endpoint.** If the user's browser/device is compromised
  (malware, malicious extension), plaintext is exposed there — E2EE cannot help.
- **Malicious/served frontend.** Users trust the code Pages serves. A hostile
  build could exfiltrate plaintext. Mitigations: strict CSP (no third-party
  `connect-src`), Subresource Integrity where applicable, reproducible builds,
  and the open invitation to inspect the Network tab.
- **Traffic analysis.** An observer learns that *some* `room_id` was written/read
  and the approximate ciphertext size and timing — not the content.
- **Shoulder-surfing the password / sharing it over an insecure channel.** Out of
  our control; the password is the whole key.
- **Availability of a capped room.** As above, a concurrent password-knower can
  seal you out, and strict membership means you can lock yourself out by
  reloading. We accept availability loss in exchange for seal integrity;
  confidentiality is never weakened by it.

## Implementation rules (enforced in review)
- Never send password, master key, content key, or plaintext to the server.
- Import the content key as a **non-extractable** `CryptoKey`.
- Use `crypto.getRandomValues` for every `iv`; never reuse an `iv` with a key.
- Validate and **size-cap** all API input; reject oversized payloads.
- Serve over HTTPS only with HSTS and a strict CSP.
- Keep Argon2id parameters in one place and covered by a test asserting they are
  not silently weakened.
- Store membership tokens **only as hashes** (SHA-256); never persist the raw
  token server-side and never log it. The raw token is returned once and kept in
  client memory only.
- Allocate slots **atomically** (D1 transaction) so concurrent joins can never
  over-seal past `capacity`.
- The cap/membership layer must **never** influence key derivation or weaken the
  content E2EE; `capacity` is plaintext metadata, not a secret.
