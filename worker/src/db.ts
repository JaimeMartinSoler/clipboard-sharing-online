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

/** A member's role within a room. The creator is the first member. */
export type MemberRole = "creator" | "joiner";

/** How a POST /api/rooms request wants to obtain a slot. */
export type JoinMode = "create" | "join";

/**
 * How content propagates between a room's terminals. Fixed at creation:
 * `manual` = Push/Pull only (no WebSocket), `push` = explicit Push received
 * live by others, `typing` = debounced auto-push while typing, received live.
 */
export type SyncMode = "manual" | "push" | "typing";

export interface JoinResult {
  /** Whether a slot was granted (false ⇒ see `reason`). */
  joined: boolean;
  /** Your 1-based terminal number after joining (== current member count). */
  slot: number;
  /** The room's capacity (set by the creator). */
  capacity: number;
  /** Whether the room is sealed (full, or was full and is now locked). */
  sealed: boolean;
  /** The role this member holds (only meaningful when `joined`). */
  role: MemberRole;
  /** The room's sync mode (the stored one — a joiner learns it here). */
  syncMode: SyncMode;
  /** Why a join was refused (only meaningful when `joined === false`). */
  reason?: "sealed" | "not_found" | "exists";
}

interface RoomStat {
  capacity: number;
  sealed: number;
  members: number;
  syncMode: SyncMode;
}

/**
 * Atomically obtain a slot in a room, either creating it (`mode: "create"`, the
 * caller becomes the `creator`) or joining an existing one (`mode: "join"`, the
 * caller becomes a `joiner`).
 *
 * The whole thing runs as one D1 batch (a single transaction). Because D1
 * serializes write transactions, the conditional member INSERT — guarded by
 * `sealed = 0 AND COUNT(members) < capacity` evaluated inside the statement —
 * can never over-seal past capacity even under a race for the last slot (no
 * TOCTOU). A separate UPDATE in the same batch flips `sealed` to 1 the instant
 * capacity is reached; `sealed` is never reset, so removing a joiner later does
 * NOT reopen the slot.
 *
 * Steps: drop the room if it is an expired shell (so reusing a password after
 * TTL yields a fresh, unsealed room) and its orphaned members; on create,
 * insert the room (idempotently) and, only if it has no members yet, the creator;
 * on join, insert a joiner only if the room is live, unsealed, and has a free
 * slot; seal if now full; then read back capacity/sealed/member-count in the
 * SAME transaction so the reported slot is this joiner's, not a later racer's.
 */
export async function allocateSlot(
  db: D1Database,
  mode: JoinMode,
  roomId: string,
  capacity: number,
  tokenHash: string,
  now: number,
  ttlMs: number,
  syncMode: SyncMode,
): Promise<JoinResult> {
  const role: MemberRole = mode === "create" ? "creator" : "joiner";
  const expiresAt = now + ttlMs;

  const dropExpired = db
    .prepare("DELETE FROM rooms WHERE room_id = ? AND expires_at <= ?")
    .bind(roomId, now);
  const dropOrphans = db
    .prepare(
      "DELETE FROM members WHERE room_id = ? AND NOT EXISTS (SELECT 1 FROM rooms WHERE rooms.room_id = members.room_id)",
    )
    .bind(roomId);
  const seal = db
    .prepare(
      "UPDATE rooms SET sealed = 1 WHERE room_id = ? AND (SELECT COUNT(*) FROM members WHERE room_id = ?) >= capacity",
    )
    .bind(roomId, roomId);
  const readBack = db
    .prepare(
      "SELECT capacity, sealed, sync_mode AS syncMode, (SELECT COUNT(*) FROM members WHERE room_id = ?) AS members FROM rooms WHERE room_id = ?",
    )
    .bind(roomId, roomId);

  let insertIndex: number;
  let statements: D1PreparedStatement[];

  if (mode === "create") {
    // Create the room on first contact; add the creator only if the room has no
    // members yet. If a live room with the same id already exists (someone
    // already created it), the creator INSERT changes 0 rows ⇒ reason "exists".
    const createRoom = db
      .prepare(
        "INSERT OR IGNORE INTO rooms (room_id, capacity, ciphertext, iv, created_at, expires_at, sealed, sync_mode) VALUES (?, ?, NULL, NULL, ?, ?, 0, ?)",
      )
      .bind(roomId, capacity, now, expiresAt, syncMode);
    const insertCreator = db
      .prepare(
        "INSERT INTO members (room_id, token_hash, joined_at, role) SELECT ?, ?, ?, 'creator' WHERE EXISTS (SELECT 1 FROM rooms WHERE room_id = ? AND expires_at > ?) AND (SELECT COUNT(*) FROM members WHERE room_id = ?) = 0",
      )
      .bind(roomId, tokenHash, now, roomId, now, roomId);
    insertIndex = 3;
    statements = [dropExpired, dropOrphans, createRoom, insertCreator, seal, readBack];
  } else {
    // Never create the room on join. Insert a joiner only into a live, unsealed
    // room with a free slot. Failure with a room present ⇒ "sealed"; absent ⇒
    // "not_found".
    const insertJoiner = db
      .prepare(
        "INSERT INTO members (room_id, token_hash, joined_at, role) SELECT ?, ?, ?, 'joiner' WHERE EXISTS (SELECT 1 FROM rooms WHERE room_id = ? AND expires_at > ?) AND (SELECT sealed FROM rooms WHERE room_id = ?) = 0 AND (SELECT COUNT(*) FROM members WHERE room_id = ?) < (SELECT capacity FROM rooms WHERE room_id = ?)",
      )
      .bind(roomId, tokenHash, now, roomId, now, roomId, roomId, roomId);
    insertIndex = 2;
    statements = [dropExpired, dropOrphans, insertJoiner, seal, readBack];
  }

  const results = await db.batch(statements);
  const joined = (results[insertIndex]?.meta.changes ?? 0) > 0;
  const stat = (results[results.length - 1]?.results?.[0] ?? null) as
    | RoomStat
    | null;

  if (joined) {
    return {
      joined: true,
      slot: stat?.members ?? 1,
      capacity: stat?.capacity ?? capacity,
      sealed: (stat?.sealed ?? 0) === 1,
      role,
      // The stored mode, read back in the same transaction — for a joiner this
      // is how they learn what the creator chose.
      syncMode: stat?.syncMode ?? syncMode,
    };
  }

  // Refused: classify why so the API can pick the right status code.
  let reason: JoinResult["reason"];
  if (stat === null) {
    reason = "not_found";
  } else if (mode === "create") {
    reason = "exists";
  } else {
    reason = "sealed";
  }
  return {
    joined: false,
    slot: stat?.members ?? 0,
    capacity: stat?.capacity ?? capacity,
    sealed: (stat?.sealed ?? 0) === 1,
    role,
    syncMode: stat?.syncMode ?? syncMode,
    reason,
  };
}

export interface RoomMeta {
  syncMode: SyncMode;
  expiresAt: number;
}

/** Sync mode + expiry of a live room, or null if missing/expired. */
export async function getRoomMeta(
  db: D1Database,
  roomId: string,
  now: number,
): Promise<RoomMeta | null> {
  const row = await db
    .prepare(
      "SELECT sync_mode AS syncMode, expires_at AS expiresAt FROM rooms WHERE room_id = ? AND expires_at > ?",
    )
    .bind(roomId, now)
    .first<RoomMeta>();
  return row ?? null;
}

export interface MemberRecord {
  id: number;
  role: MemberRole;
  joinedAt: number;
}

/** List a room's members (id, role, join time) ordered oldest-first. No PII. */
export async function listMembers(
  db: D1Database,
  roomId: string,
): Promise<MemberRecord[]> {
  const res = await db
    .prepare(
      "SELECT id, role, joined_at AS joinedAt FROM members WHERE room_id = ? ORDER BY joined_at ASC, id ASC",
    )
    .bind(roomId)
    .all<MemberRecord>();
  return res.results ?? [];
}

/** The role bound to a token hash in a room, or null if it is not a member. */
export async function getMemberRole(
  db: D1Database,
  roomId: string,
  tokenHash: string,
): Promise<MemberRole | null> {
  const row = await db
    .prepare(
      "SELECT role FROM members WHERE room_id = ? AND token_hash = ? LIMIT 1",
    )
    .bind(roomId, tokenHash)
    .first<{ role: MemberRole }>();
  return row?.role ?? null;
}

export type RemoveMemberResult =
  | { outcome: "removed"; tokenHash: string }
  | { outcome: "not_found" }
  | { outcome: "is_creator" };

/**
 * Remove a single joiner from a room, revoking their token. The seal flag is
 * deliberately left untouched: the freed slot does NOT reopen (see migration
 * 0002). The creator can never be removed this way. On success the revoked
 * member's token HASH is returned so the caller can sever any live WebSockets
 * tagged with it — the raw token is never stored, so a hash is all there is.
 */
export async function removeMember(
  db: D1Database,
  roomId: string,
  memberId: number,
): Promise<RemoveMemberResult> {
  const target = await db
    .prepare(
      "SELECT role, token_hash AS tokenHash FROM members WHERE id = ? AND room_id = ? LIMIT 1",
    )
    .bind(memberId, roomId)
    .first<{ role: MemberRole; tokenHash: string }>();
  if (!target) return { outcome: "not_found" };
  if (target.role === "creator") return { outcome: "is_creator" };
  await db
    .prepare("DELETE FROM members WHERE id = ? AND room_id = ?")
    .bind(memberId, roomId)
    .run();
  return { outcome: "removed", tokenHash: target.tokenHash };
}

/** Nuke a room entirely: its blob, its members, everything. Idempotent. */
export async function deleteRoom(db: D1Database, roomId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM rooms WHERE room_id = ?").bind(roomId),
    db.prepare("DELETE FROM members WHERE room_id = ?").bind(roomId),
  ]);
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
