import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import worker from "../src/index";

export const API = "https://api.test";

/** Drive the Worker for one request inside a fresh execution context. */
export async function call(input: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(API + input, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rooms"),
    env.DB.prepare("DELETE FROM members"),
  ]);
}

interface SeedRoomOptions {
  capacity?: number;
  ciphertext?: string | null;
  iv?: string | null;
  expiresAt?: number;
  sealed?: 0 | 1;
  syncMode?: "manual" | "push" | "typing";
}

export async function seedRoom(
  roomId: string,
  opts: SeedRoomOptions = {},
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO rooms (room_id, capacity, ciphertext, iv, created_at, expires_at, sealed, sync_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      roomId,
      opts.capacity ?? 2,
      opts.ciphertext ?? null,
      opts.iv ?? null,
      now,
      opts.expiresAt ?? now + 600_000,
      opts.sealed ?? 0,
      opts.syncMode ?? "manual",
    )
    .run();
}

/** Seed a membership and return the raw bearer token to present in requests. */
export async function seedMember(
  roomId: string,
  token = "test-token-default",
  role: "creator" | "joiner" = "joiner",
): Promise<string> {
  await env.DB.prepare(
    "INSERT INTO members (room_id, token_hash, joined_at, role) VALUES (?, ?, ?, ?)",
  )
    .bind(roomId, await sha256hex(token), Date.now(), role)
    .run();
  return token;
}

/** The auto-increment id of a seeded member (to target member-scoped routes). */
export async function memberId(
  roomId: string,
  token: string,
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT id FROM members WHERE room_id = ? AND token_hash = ? LIMIT 1",
  )
    .bind(roomId, await sha256hex(token))
    .first<{ id: number }>();
  if (!row) throw new Error("member not found");
  return row.id;
}

/** Read the sealed flag for a room (0/1), or null if the room is gone. */
export async function roomSealed(roomId: string): Promise<number | null> {
  const row = await env.DB.prepare(
    "SELECT sealed FROM rooms WHERE room_id = ?",
  )
    .bind(roomId)
    .first<{ sealed: number }>();
  return row?.sealed ?? null;
}

export function bearer(token: string, ip = "1.1.1.1"): HeadersInit {
  return { Authorization: `Bearer ${token}`, "CF-Connecting-IP": ip };
}

export async function roomCount(roomId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM rooms WHERE room_id = ?",
  )
    .bind(roomId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function memberCount(roomId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM members WHERE room_id = ?",
  )
    .bind(roomId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Open a live-sync WebSocket the way the browser does: an Upgrade request with
 * the bearer token smuggled in the subprotocol list. Returns the raw Response
 * so callers can assert failure statuses; on 101 the socket is accepted and
 * ready for events.
 */
export async function connectWs(
  roomId: string,
  token: string,
  ip = "9.9.9.9",
): Promise<{ res: Response; ws: WebSocket | null }> {
  const res = await call(`/api/rooms/${roomId}/ws`, {
    headers: {
      Upgrade: "websocket",
      "Sec-WebSocket-Protocol": `cso.v1, cso.bearer.${token}`,
      "CF-Connecting-IP": ip,
    },
  });
  const ws = res.webSocket ?? null;
  ws?.accept();
  return { res, ws };
}

/** Resolve with the next text frame, or reject after `timeoutMs`. */
export function nextMessage(ws: WebSocket, timeoutMs = 2_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for a WS message")),
      timeoutMs,
    );
    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        resolve(typeof event.data === "string" ? event.data : "");
      },
      { once: true },
    );
  });
}

/** Resolve with the close code/reason, or reject after `timeoutMs`. */
export function nextClose(
  ws: WebSocket,
  timeoutMs = 2_000,
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for a WS close")),
      timeoutMs,
    );
    ws.addEventListener(
      "close",
      (event) => {
        clearTimeout(timer);
        resolve({ code: event.code, reason: event.reason });
      },
      { once: true },
    );
  });
}

/** Assert silence: resolves false if a frame arrives within `windowMs`. */
export function noMessageWithin(
  ws: WebSocket,
  windowMs = 250,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), windowMs);
    ws.addEventListener(
      "message",
      () => {
        clearTimeout(timer);
        resolve(false);
      },
      { once: true },
    );
  });
}
