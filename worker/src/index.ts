/**
 * Clipboard Sharing Online — Worker API (Hono + D1).
 *
 * The server is a dumb encrypted key/value store. It sees only opaque ids,
 * ciphertext, ivs, timestamps, a capacity count, and membership token hashes —
 * never the password, keys, or plaintext (those live only in the browser).
 *
 * Stage 3: clipboard routes + size cap + per-IP rate limit + lazy/cron expiry.
 * Bearer-token enforcement and POST /api/rooms are added in stage 4.
 * Issue #7: create/join roles + creator-only room management endpoints.
 */
import { Hono } from "hono";
import type { Bindings } from "./bindings";
import {
  allocateSlot,
  clearClipboard,
  deleteRoom,
  getClipboard,
  getMemberRole,
  getRoomMeta,
  isMember,
  type JoinMode,
  lazyExpireRoom,
  listMembers,
  removeMember,
  setClipboard,
  sweepExpired,
  type SyncMode,
} from "./db";
import { HDR_EXPIRES_AT, HDR_TOKEN_HASH, RoomDO, WS_PROTOCOL } from "./room-do";

// Wrangler resolves Durable Object classes from the `main` module's exports.
export { RoomDO };
export type { Bindings };

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function isBase64url(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    BASE64URL.test(value)
  );
}

/**
 * Decoded byte length of an unpadded base64url string. Every 4 chars encode 3
 * bytes; a 2- or 3-char remainder encodes 1 or 2 bytes. `floor(len * 3 / 4)` is
 * exact for well-formed unpadded base64url, so the size cap counts real bytes,
 * not the ~1.33× longer encoded string.
 */
function base64urlByteLength(value: string): number {
  return Math.floor((value.length * 3) / 4);
}

interface PushBody {
  roomId: string;
  ciphertext: string;
  iv: string;
  ttlMs?: number;
}

function parsePushBody(body: unknown, maxCiphertext: number): PushBody | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  // roomId: 16 bytes → 22 base64url chars; iv: 12 bytes → 16. Bound generously.
  if (!isBase64url(o.roomId, 64)) return null;
  if (!isBase64url(o.iv, 64)) return null;
  // Cheap shape guard only (→ 400); the precise byte cap (→ 413) is applied
  // after auth. `maxCiphertext` is a BYTE budget and base64url is ~1.33× longer,
  // so the char bound must exceed it — `* 2` is a generous ceiling that still
  // rejects egregiously oversized bodies before the exact byte check.
  if (!isBase64url(o.ciphertext, maxCiphertext * 2)) return null;
  if (o.ttlMs !== undefined && typeof o.ttlMs !== "number") return null;
  return {
    roomId: o.roomId,
    ciphertext: o.ciphertext,
    iv: o.iv,
    ttlMs: typeof o.ttlMs === "number" ? o.ttlMs : undefined,
  };
}

interface JoinBody {
  roomId: string;
  capacity: number;
  mode: JoinMode;
  syncMode: SyncMode;
}

function parseJoinBody(body: unknown): JoinBody | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  if (!isBase64url(o.roomId, 64)) return null;
  // Default to "join": creating a room is the deliberate act, so an omitted or
  // unrecognised mode never silently creates one.
  let mode: JoinMode = "join";
  if (o.mode !== undefined) {
    if (o.mode !== "create" && o.mode !== "join") return null;
    mode = o.mode;
  }
  // Sync mode defaults to 'manual' so pre-realtime clients keep today's exact
  // semantics. Only meaningful on create; on join the stored mode wins.
  let syncMode: SyncMode = "manual";
  if (o.syncMode !== undefined) {
    if (o.syncMode !== "manual" && o.syncMode !== "push" && o.syncMode !== "typing") {
      return null;
    }
    syncMode = o.syncMode;
  }
  // `0` is the open-room sentinel (no terminal limit, never sealed); `1`–`6` are
  // the bounded seal-on-full sizes. Ignored on join (the room already has one).
  let capacity = 2; // default
  if (o.capacity !== undefined) {
    if (
      typeof o.capacity !== "number" ||
      !Number.isInteger(o.capacity) ||
      o.capacity < 0 ||
      o.capacity > 6
    ) {
      return null; // → 400 on bad capacity
    }
    capacity = o.capacity;
  }
  return { roomId: o.roomId, capacity, mode, syncMode };
}

/** A fresh, high-entropy bearer token (256 bits), base64url. Returned once. */
function makeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Extract a non-empty Bearer token from an Authorization header, or null. */
function bearerToken(authHeader: string | undefined): string | null {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

/**
 * Extract the membership token a WebSocket client smuggled through the
 * `Sec-WebSocket-Protocol` header (`cso.v1, cso.bearer.<token>`). Browsers
 * cannot set an Authorization header on a WebSocket, and a query param would
 * spill the raw token into edge logs — the subprotocol list is the one place
 * a browser lets us put it that stays out of URLs.
 */
function tokenFromSubprotocol(header: string | undefined): string | null {
  if (typeof header !== "string") return null;
  for (const entry of header.split(",")) {
    const candidate = entry.trim();
    if (candidate.startsWith("cso.bearer.")) {
      const token = candidate.slice("cso.bearer.".length);
      return token.length === 0 ? null : token;
    }
  }
  return null;
}

/** Authorize a request against a room's membership via its Bearer token. */
async function authorizeMember(
  db: D1Database,
  roomId: string,
  authHeader: string | undefined,
): Promise<boolean> {
  const token = bearerToken(authHeader);
  if (token === null) return false;
  return isMember(db, roomId, await sha256hex(token));
}

/**
 * Resolve the caller's role in a room from their Bearer token. Returns null if
 * the header is absent/malformed or the token is not a live member — callers map
 * that to 401, and a non-creator role to 403.
 */
async function memberRole(
  db: D1Database,
  roomId: string,
  authHeader: string | undefined,
): Promise<"creator" | "joiner" | null> {
  const token = bearerToken(authHeader);
  if (token === null) return null;
  return getMemberRole(db, roomId, await sha256hex(token));
}

function clampTtl(ttlMs: number | undefined, env: Bindings): number {
  const fallback = Number(env.TTL_DEFAULT_MS);
  const max = Number(env.TTL_MAX_MS);
  if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return fallback;
  }
  return Math.min(ttlMs, max);
}

// In-Worker fixed-window per-IP limiter. State is per-isolate (best-effort,
// defense-in-depth); a Cloudflare Rate Limiting rule can be layered at the edge.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let lastRateSweep = 0;

/**
 * Opportunistically evict expired buckets so the map can't grow unbounded as a
 * long-lived isolate sees many distinct IPs. Throttled to once per window, so
 * the hot path stays O(1) and the sweep is at most O(n) once every `windowMs`.
 */
function sweepRateBuckets(now: number, windowMs: number): void {
  if (now - lastRateSweep < windowMs) return;
  lastRateSweep = now;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(ip);
  }
}

/** Test hook: clear the in-memory limiter between cases. */
export function __resetRateLimit(): void {
  rateBuckets.clear();
  lastRateSweep = 0;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", async (c, next) => {
  const max = Number(c.env.RATE_LIMIT_MAX);
  if (Number.isFinite(max) && max > 0) {
    const windowMs = Number(c.env.RATE_LIMIT_WINDOW_MS);
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const now = Date.now();
    sweepRateBuckets(now, windowMs);
    const bucket = rateBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > max) {
        return c.json({ error: "Too many requests" }, 429);
      }
    }
  }
  return next();
});

app.post("/api/rooms", async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  const body = parseJoinBody(raw);
  if (!body) return c.json({ error: "Invalid request" }, 400);

  const now = Date.now();
  const token = makeToken();
  const tokenHash = await sha256hex(token);
  const result = await allocateSlot(
    c.env.DB,
    body.mode,
    body.roomId,
    body.capacity,
    tokenHash,
    now,
    Number(c.env.TTL_DEFAULT_MS),
    body.syncMode,
  );

  if (!result.joined) {
    // 404: joining a room that does not exist (yet). 409: sealed/full, or a
    // create collision (someone already created this room). Uniform, minimal
    // detail — never an existence oracle beyond what the client already knows.
    if (result.reason === "not_found") {
      return c.json({ error: "Room not found" }, 404);
    }
    if (result.reason === "exists") {
      return c.json({ error: "Room already exists", exists: true }, 409);
    }
    return c.json(
      { error: "Room is sealed", capacity: result.capacity, sealed: true },
      409,
    );
  }
  // A joiner landing in a live room grows the creator's roster; nudge the
  // room's sockets so its room-controls view refreshes in near-real time.
  // Skipped for manual rooms (no DO/sockets by contract) and for a create
  // (no other members yet, and the creator's own socket connects afterwards).
  if (result.role === "joiner" && result.syncMode !== "manual") {
    c.executionCtx.waitUntil(
      c.env.ROOM.get(c.env.ROOM.idFromName(body.roomId)).broadcastRoster(),
    );
  }
  // The raw token is returned exactly once; only its hash is stored server-side.
  return c.json({
    token,
    joined: result.slot,
    capacity: result.capacity,
    sealed: result.sealed,
    role: result.role,
    // The stored mode — this is how a joiner learns what the creator chose.
    syncMode: result.syncMode,
  });
});

// --- Live sync (Durable Object + WebSocket) ---------------------------------

app.get("/api/rooms/:roomId/ws", async (c) => {
  const roomId = c.req.param("roomId");
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "Expected a WebSocket upgrade" }, 426);
  }
  // Bearer auth rides in the subprotocol list; validate it HERE, against D1,
  // before anything reaches the Durable Object.
  const token = tokenFromSubprotocol(c.req.header("Sec-WebSocket-Protocol"));
  if (token === null) return c.json({ error: "Unauthorized" }, 401);
  const tokenHash = await sha256hex(token);
  if (!(await isMember(c.env.DB, roomId, tokenHash))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const now = Date.now();
  const meta = await getRoomMeta(c.env.DB, roomId, now);
  if (!meta) {
    await lazyExpireRoom(c.env.DB, roomId, now);
    return c.json({ error: "Not found" }, 404);
  }
  // Manual rooms never open sockets — by contract, not just by client choice.
  if (meta.syncMode === "manual") {
    return c.json({ error: "Room is not live" }, 409);
  }

  // Forward the upgrade with the raw token STRIPPED (the DO only ever sees
  // the hash) and the echo-protocol + identity passed as internal headers.
  const headers = new Headers(c.req.raw.headers);
  headers.set("Sec-WebSocket-Protocol", WS_PROTOCOL);
  headers.set(HDR_TOKEN_HASH, tokenHash);
  headers.set(HDR_EXPIRES_AT, String(meta.expiresAt));
  const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
  return stub.fetch(new Request(c.req.raw, { headers }));
});

// --- Creator-only room management (issue #7) -------------------------------
// All three enforce creator role at the Worker/DB layer: a non-member gets 401,
// a joiner gets 403. The view is a convenience; this is the real boundary.

app.get("/api/rooms/:roomId/members", async (c) => {
  const roomId = c.req.param("roomId");
  const role = await memberRole(c.env.DB, roomId, c.req.header("Authorization"));
  if (role === null) return c.json({ error: "Unauthorized" }, 401);
  if (role !== "creator") return c.json({ error: "Forbidden" }, 403);
  const members = await listMembers(c.env.DB, roomId);
  return c.json({ members });
});

app.delete("/api/rooms/:roomId/members/:memberId", async (c) => {
  const roomId = c.req.param("roomId");
  const memberId = Number(c.req.param("memberId"));
  if (!Number.isInteger(memberId)) {
    return c.json({ error: "Invalid member id" }, 400);
  }
  const role = await memberRole(c.env.DB, roomId, c.req.header("Authorization"));
  if (role === null) return c.json({ error: "Unauthorized" }, 401);
  if (role !== "creator") return c.json({ error: "Forbidden" }, 403);

  const result = await removeMember(c.env.DB, roomId, memberId);
  if (result.outcome === "not_found") return c.json({ error: "Not found" }, 404);
  // The creator cannot remove themselves here; use DELETE /api/rooms to nuke it.
  if (result.outcome === "is_creator") {
    return c.json({ error: "Cannot remove the creator" }, 400);
  }
  // Revocation also severs the member's live sockets (identified by token
  // hash). Fire-and-forget: the membership row is already gone either way.
  c.executionCtx.waitUntil(
    c.env.ROOM.get(c.env.ROOM.idFromName(roomId)).closeMember(result.tokenHash),
  );
  return c.json({ ok: true });
});

app.delete("/api/rooms/:roomId", async (c) => {
  const roomId = c.req.param("roomId");
  const role = await memberRole(c.env.DB, roomId, c.req.header("Authorization"));
  if (role === null) return c.json({ error: "Unauthorized" }, 401);
  if (role !== "creator") return c.json({ error: "Forbidden" }, 403);
  await deleteRoom(c.env.DB, roomId);
  // Nuking the room also closes every live socket (code 4004).
  c.executionCtx.waitUntil(
    c.env.ROOM.get(c.env.ROOM.idFromName(roomId)).closeAll(),
  );
  return c.body(null, 204);
});

app.post("/api/clipboard", async (c) => {
  const maxCiphertext = Number(c.env.MAX_CIPHERTEXT_BYTES);
  const raw: unknown = await c.req.json().catch(() => null);
  const body = parsePushBody(raw, maxCiphertext);
  if (!body) return c.json({ error: "Invalid request" }, 400);

  // Hash the bearer token once: it authorizes the push AND identifies the
  // pusher's own sockets for echo suppression in live rooms.
  const token = bearerToken(c.req.header("Authorization"));
  if (token === null) return c.json({ error: "Unauthorized" }, 401);
  const tokenHash = await sha256hex(token);
  if (!(await isMember(c.env.DB, body.roomId, tokenHash))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (base64urlByteLength(body.ciphertext) > maxCiphertext) {
    return c.json({ error: "Payload too large" }, 413);
  }

  const now = Date.now();
  const expiresAt = now + clampTtl(body.ttlMs, c.env);
  const meta = await getRoomMeta(c.env.DB, body.roomId, now);
  if (!meta) return c.json({ error: "Not found" }, 404);

  // Manual rooms write straight to D1 (no DO is ever created for them). Live
  // rooms route the write THROUGH the room's DO so the D1 write + broadcast
  // happen in one serialized turn — every member sees pushes in the same
  // order they were committed. The DO re-runs setClipboard's liveness guard,
  // so a room that expired between the meta read and here still yields 404.
  const stored =
    meta.syncMode === "manual"
      ? await setClipboard(
          c.env.DB,
          body.roomId,
          body.ciphertext,
          body.iv,
          expiresAt,
          now,
        )
      : await c.env.ROOM.get(c.env.ROOM.idFromName(body.roomId)).push({
          roomId: body.roomId,
          ciphertext: body.ciphertext,
          iv: body.iv,
          expiresAt,
          now,
          pusherTokenHash: tokenHash,
        });
  if (!stored) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, expiresAt });
});

app.get("/api/clipboard/:roomId", async (c) => {
  const roomId = c.req.param("roomId");
  if (!(await authorizeMember(c.env.DB, roomId, c.req.header("Authorization")))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const now = Date.now();
  const row = await getClipboard(c.env.DB, roomId, now);
  if (!row) {
    // Drop the room+members if this miss was due to expiry. Uniform 404 either
    // way: missing, expired, never-pushed, and wrong-password all look alike.
    await lazyExpireRoom(c.env.DB, roomId, now);
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({
    ciphertext: row.ciphertext,
    iv: row.iv,
    expiresAt: row.expiresAt,
  });
});

app.delete("/api/clipboard/:roomId", async (c) => {
  const roomId = c.req.param("roomId");
  if (!(await authorizeMember(c.env.DB, roomId, c.req.header("Authorization")))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  // Always 204 for a member — never reveal whether a blob was actually present.
  await clearClipboard(c.env.DB, roomId);
  return c.body(null, 204);
});

/** Cron sweep entrypoint (also exported for direct testing). */
export async function handleScheduled(env: Bindings): Promise<void> {
  await sweepExpired(env.DB, Date.now());
}

export default {
  fetch: (request: Request, env: Bindings, ctx: ExecutionContext) =>
    app.fetch(request, env, ctx),
  scheduled: (_event: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil(handleScheduled(env));
  },
} satisfies ExportedHandler<Bindings>;
