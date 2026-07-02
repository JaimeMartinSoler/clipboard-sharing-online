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
}

export async function seedRoom(
  roomId: string,
  opts: SeedRoomOptions = {},
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO rooms (room_id, capacity, ciphertext, iv, created_at, expires_at, sealed) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      roomId,
      opts.capacity ?? 2,
      opts.ciphertext ?? null,
      opts.iv ?? null,
      now,
      opts.expiresAt ?? now + 600_000,
      opts.sealed ?? 0,
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
