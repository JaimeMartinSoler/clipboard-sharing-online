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
}

export async function seedRoom(
  roomId: string,
  opts: SeedRoomOptions = {},
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO rooms (room_id, capacity, ciphertext, iv, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      roomId,
      opts.capacity ?? 2,
      opts.ciphertext ?? null,
      opts.iv ?? null,
      now,
      opts.expiresAt ?? now + 600_000,
    )
    .run();
}

/** Seed a membership and return the raw bearer token to present in requests. */
export async function seedMember(
  roomId: string,
  token = "test-token-default",
): Promise<string> {
  await env.DB.prepare(
    "INSERT INTO members (room_id, token_hash, joined_at) VALUES (?, ?, ?)",
  )
    .bind(roomId, await sha256hex(token), Date.now())
    .run();
  return token;
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
