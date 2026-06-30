/**
 * Clipboard Sharing Online — Worker API (Hono + D1).
 *
 * The server is a dumb encrypted key/value store. It sees only opaque ids,
 * ciphertext, ivs, timestamps, a capacity count, and membership token hashes —
 * never the password, keys, or plaintext (those live only in the browser).
 *
 * Stage 3: clipboard routes + size cap + per-IP rate limit + lazy/cron expiry.
 * Bearer-token enforcement and POST /api/rooms are added in stage 4.
 */
import { Hono } from "hono";
import {
  clearClipboard,
  getClipboard,
  isMember,
  joinRoom,
  lazyExpireRoom,
  setClipboard,
  sweepExpired,
} from "./db";

export interface Bindings {
  DB: D1Database;
  TTL_DEFAULT_MS: string;
  TTL_MAX_MS: string;
  MAX_CIPHERTEXT_BYTES: string;
  RATE_LIMIT_MAX: string;
  RATE_LIMIT_WINDOW_MS: string;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function isBase64url(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    BASE64URL.test(value)
  );
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
  // ciphertext shape here; the precise size cap (→ 413) is checked separately.
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
}

function parseJoinBody(body: unknown): JoinBody | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  if (!isBase64url(o.roomId, 64)) return null;
  let capacity = 2; // default
  if (o.capacity !== undefined) {
    if (
      typeof o.capacity !== "number" ||
      !Number.isInteger(o.capacity) ||
      o.capacity < 1 ||
      o.capacity > 10
    ) {
      return null; // → 400 on bad capacity
    }
    capacity = o.capacity;
  }
  return { roomId: o.roomId, capacity };
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

/** Authorize a request against a room's membership via its Bearer token. */
async function authorizeMember(
  db: D1Database,
  roomId: string,
  authHeader: string | undefined,
): Promise<boolean> {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (token.length === 0) return false;
  return isMember(db, roomId, await sha256hex(token));
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

/** Test hook: clear the in-memory limiter between cases. */
export function __resetRateLimit(): void {
  rateBuckets.clear();
}

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", async (c, next) => {
  const max = Number(c.env.RATE_LIMIT_MAX);
  if (Number.isFinite(max) && max > 0) {
    const windowMs = Number(c.env.RATE_LIMIT_WINDOW_MS);
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const now = Date.now();
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
  const result = await joinRoom(
    c.env.DB,
    body.roomId,
    body.capacity,
    tokenHash,
    now,
    Number(c.env.TTL_DEFAULT_MS),
  );

  if (!result.joined) {
    return c.json(
      { error: "Room is sealed", capacity: result.capacity, sealed: true },
      409,
    );
  }
  // The raw token is returned exactly once; only its hash is stored server-side.
  return c.json({
    token,
    joined: result.slot,
    capacity: result.capacity,
    sealed: result.slot >= result.capacity,
  });
});

app.post("/api/clipboard", async (c) => {
  const maxCiphertext = Number(c.env.MAX_CIPHERTEXT_BYTES);
  const raw: unknown = await c.req.json().catch(() => null);
  const body = parsePushBody(raw, maxCiphertext);
  if (!body) return c.json({ error: "Invalid request" }, 400);

  if (
    !(await authorizeMember(c.env.DB, body.roomId, c.req.header("Authorization")))
  ) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (body.ciphertext.length > maxCiphertext) {
    return c.json({ error: "Payload too large" }, 413);
  }

  const now = Date.now();
  const expiresAt = now + clampTtl(body.ttlMs, c.env);
  const stored = await setClipboard(
    c.env.DB,
    body.roomId,
    body.ciphertext,
    body.iv,
    expiresAt,
    now,
  );
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
