/**
 * D1 query helpers. Pure data access — no HTTP concerns. Every read filters on
 * `expires_at > now` so an expired room behaves as if it never existed (no
 * existence oracle), and expiry removes a room together with its members.
 */

export interface ClipboardRow {
  ciphertext: string;
  iv: string;
  expiresAt: number;
}

/**
 * Write the encrypted blob and (re)set the room's TTL. Returns false if no live
 * room matched — rooms are created only by joining (POST /api/rooms), so a push
 * to a missing/expired room is rejected rather than resurrecting it.
 */
export async function setClipboard(
  db: D1Database,
  roomId: string,
  ciphertext: string,
  iv: string,
  expiresAt: number,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE rooms SET ciphertext = ?, iv = ?, expires_at = ? WHERE room_id = ? AND expires_at > ?",
    )
    .bind(ciphertext, iv, expiresAt, roomId, now)
    .run();
  return res.meta.changes > 0;
}

/** Fetch the live blob for a room, or null if missing/expired/never-pushed. */
export async function getClipboard(
  db: D1Database,
  roomId: string,
  now: number,
): Promise<ClipboardRow | null> {
  const row = await db
    .prepare(
      "SELECT ciphertext, iv, expires_at AS expiresAt FROM rooms WHERE room_id = ? AND expires_at > ? AND ciphertext IS NOT NULL",
    )
    .bind(roomId, now)
    .first<ClipboardRow>();
  return row ?? null;
}

/** Clear a room's blob (the room and memberships stay). Idempotent. */
export async function clearClipboard(
  db: D1Database,
  roomId: string,
): Promise<void> {
  await db
    .prepare("UPDATE rooms SET ciphertext = NULL, iv = NULL WHERE room_id = ?")
    .bind(roomId)
    .run();
}

/**
 * Lazy expiry for a single room: delete it if past TTL, and drop its members
 * once the room is gone. A no-op when the room is still live.
 */
export async function lazyExpireRoom(
  db: D1Database,
  roomId: string,
  now: number,
): Promise<void> {
  await db.batch([
    db
      .prepare("DELETE FROM rooms WHERE room_id = ? AND expires_at <= ?")
      .bind(roomId, now),
    db
      .prepare(
        "DELETE FROM members WHERE room_id = ? AND NOT EXISTS (SELECT 1 FROM rooms WHERE rooms.room_id = members.room_id)",
      )
      .bind(roomId),
  ]);
}

export interface JoinResult {
  /** Whether a slot was granted (false ⇒ the room is sealed). */
  joined: boolean;
  /** Your 1-based terminal number after joining (== current member count). */
  slot: number;
  /** The room's capacity (set by whoever joined first). */
  capacity: number;
}

/**
 * Atomically join (or create) a room and claim a slot.
 *
 * The whole thing runs as one D1 batch (a single transaction). Because D1
 * serializes write transactions, the conditional member INSERT — guarded by
 * `COUNT(members) < capacity` evaluated inside the statement — can never
 * over-seal past capacity even under a race for the last slot (no TOCTOU).
 *
 * Steps: drop the room if it is an expired shell (so reusing a password after
 * TTL yields a fresh, unsealed room) and its orphaned members; create the room
 * on first contact with the requested capacity; insert the member only if a slot
 * is free; then read back capacity + member count. The caller stores only
 * `tokenHash`; the raw token is returned to the client once and never persisted.
 *
 * The read-back is the LAST statement of the same batch, so it observes exactly
 * this transaction's view — including this joiner's insert but not concurrent
 * uncommitted ones. That keeps the reported `slot`/`sealed` consistent with the
 * insert under a race; reading it in a separate statement after commit could
 * observe a later joiner and inflate the terminal number.
 */
export async function joinRoom(
  db: D1Database,
  roomId: string,
  capacity: number,
  tokenHash: string,
  now: number,
  ttlMs: number,
): Promise<JoinResult> {
  const expiresAt = now + ttlMs;
  const results = await db.batch([
    db
      .prepare("DELETE FROM rooms WHERE room_id = ? AND expires_at <= ?")
      .bind(roomId, now),
    db
      .prepare(
        "DELETE FROM members WHERE room_id = ? AND NOT EXISTS (SELECT 1 FROM rooms WHERE rooms.room_id = members.room_id)",
      )
      .bind(roomId),
    db
      .prepare(
        "INSERT OR IGNORE INTO rooms (room_id, capacity, ciphertext, iv, created_at, expires_at) VALUES (?, ?, NULL, NULL, ?, ?)",
      )
      .bind(roomId, capacity, now, expiresAt),
    db
      .prepare(
        "INSERT INTO members (room_id, token_hash, joined_at) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM members WHERE room_id = ?) < (SELECT capacity FROM rooms WHERE room_id = ?)",
      )
      .bind(roomId, tokenHash, now, roomId, roomId),
    db
      .prepare(
        "SELECT capacity, (SELECT COUNT(*) FROM members WHERE room_id = ?) AS members FROM rooms WHERE room_id = ?",
      )
      .bind(roomId, roomId),
  ]);

  const joined = (results[3]?.meta.changes ?? 0) > 0;
  const stat = (results[4]?.results?.[0] ?? null) as {
    capacity: number;
    members: number;
  } | null;

  return {
    joined,
    slot: stat?.members ?? 0,
    capacity: stat?.capacity ?? capacity,
  };
}

/** True if a token hash matches a live membership of the room. */
export async function isMember(
  db: D1Database,
  roomId: string,
  tokenHash: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS ok FROM members WHERE room_id = ? AND token_hash = ? LIMIT 1",
    )
    .bind(roomId, tokenHash)
    .first();
  return row !== null;
}

/** Cron sweep: drop every expired room and any orphaned memberships. */
export async function sweepExpired(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM rooms WHERE expires_at <= ?").bind(now),
    db.prepare(
      "DELETE FROM members WHERE room_id NOT IN (SELECT room_id FROM rooms)",
    ),
  ]);
}
