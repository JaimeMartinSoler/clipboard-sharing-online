/**
 * Live-sync WebSocket client for rooms in a live mode (`push` / `typing`).
 *
 * The channel is downstream-only: the server (a per-room Durable Object)
 * broadcasts `{v:1, type:"update", ciphertext, iv, expiresAt}` frames when a
 * member pushes; content uploads stay on the HTTP API. Everything on the wire
 * is ciphertext — the zero-knowledge model is unchanged.
 *
 * Auth: browsers cannot set an Authorization header on a WebSocket and a
 * query param would spill the raw token into edge logs, so the bearer token
 * rides in the `Sec-WebSocket-Protocol` list (`cso.v1, cso.bearer.<token>`).
 * The Worker validates it against the membership hash and strips it before
 * the upgrade reaches the Durable Object.
 */
import { err, ok, type Result } from "./result";

/** Must match the Worker's close codes (worker/src/room-do.ts). */
const CLOSE_REVOKED = 4001;
const CLOSE_ROOM_GONE = 4004;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface LiveUpdate {
  ciphertext: string;
  iv: string;
  expiresAt: number;
}

export type LiveEvent =
  /** Socket (re)established. Callers should catch up with an HTTP pull. */
  | { type: "open" }
  /** A member pushed; the payload is ciphertext to decrypt locally. */
  | { type: "update"; update: LiveUpdate }
  /** Membership changed (join/revoke); re-pull the roster over HTTP. */
  | { type: "roster" }
  /** Connection lost; a retry is scheduled (attempt counts from 1). */
  | { type: "reconnecting"; attempt: number }
  /** Terminal — the client must NOT reconnect. */
  | { type: "closed"; reason: LiveClosedReason };

/**
 * A frame the server can broadcast on the downstream channel: an `update`
 * (ciphertext to apply) or a data-less `roster` nudge (membership changed).
 */
export type LiveFrame =
  | { type: "update"; update: LiveUpdate }
  | { type: "roster" };

export type LiveClosedReason =
  /** This member was revoked by the creator (close code 4001). */
  | "revoked"
  /** The room was removed or expired (close code 4004). */
  | "room-gone"
  /** Gave up after too many failed reconnect attempts. */
  | "failed";

/**
 * The slice of the WebSocket surface this module touches, injectable so tests
 * can drive the connection with a scripted fake.
 */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type CreateSocket = (roomId: string, token: string) => SocketLike;

export interface ConnectLiveOptions {
  roomId: string;
  token: string;
  onEvent: (event: LiveEvent) => void;
  /** Test seam; defaults to a real browser WebSocket. */
  createSocket?: CreateSocket;
  /** Keepalive interval; the server answers "ping" without waking the DO. */
  pingIntervalMs?: number;
  /** Consecutive failed attempts before giving up with `closed:"failed"`. */
  maxAttempts?: number;
}

export interface LiveConnection {
  /** Tear down silently: no further events, no reconnects. */
  close(): void;
}

/**
 * Build the WebSocket URL for a room. Same-origin in production ('self' +
 * explicit wss: hosts in the CSP). Under `next dev` the /api rewrite proxy
 * cannot carry WebSocket upgrades, so local dev connects straight to the
 * wrangler dev server (CSP does not apply to `next dev`).
 */
export function wsUrl(
  roomId: string,
  loc: { protocol: string; host: string },
): string {
  const path = `/api/rooms/${encodeURIComponent(roomId)}/ws`;
  const hostname = loc.host.split(":")[0];
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `ws://127.0.0.1:8787${path}`;
  }
  const scheme = loc.protocol === "http:" ? "ws:" : "wss:";
  return `${scheme}//${loc.host}${path}`;
}

/**
 * Parse one incoming downstream frame into a `LiveFrame`. Recognises the
 * data-less `roster` nudge and the content `update`; everything else (e.g. a
 * "pong" keepalive answer, an unknown version) is an error the caller drops.
 */
export function parseLiveFrame(data: unknown): Result<LiveFrame> {
  if (typeof data !== "string") return err("Not a text frame.");
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return err("Not JSON.");
  }
  if (typeof raw !== "object" || raw === null) return err("Not an object.");
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return err("Unknown version.");
  if (o.type === "roster") return ok({ type: "roster" });
  const update = parseLiveMessage(data);
  if (!update.ok) return err(update.error);
  return ok({ type: "update", update: update.value });
}

/** Parse one incoming update frame. Non-update frames (e.g. "pong") are errors. */
export function parseLiveMessage(data: unknown): Result<LiveUpdate> {
  if (typeof data !== "string") return err("Not a text frame.");
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return err("Not JSON.");
  }
  if (typeof raw !== "object" || raw === null) return err("Not an object.");
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || o.type !== "update") return err("Not an update frame.");
  if (typeof o.ciphertext !== "string" || !BASE64URL.test(o.ciphertext)) {
    return err("Bad ciphertext.");
  }
  if (typeof o.iv !== "string" || !BASE64URL.test(o.iv)) {
    return err("Bad iv.");
  }
  if (typeof o.expiresAt !== "number" || !Number.isFinite(o.expiresAt)) {
    return err("Bad expiresAt.");
  }
  return ok({ ciphertext: o.ciphertext, iv: o.iv, expiresAt: o.expiresAt });
}

function defaultCreateSocket(roomId: string, token: string): SocketLike {
  const ws = new WebSocket(wsUrl(roomId, window.location), [
    "cso.v1",
    `cso.bearer.${token}`,
  ]);
  // The DOM lib types the on* handlers with `this`/event parameters that the
  // narrower SocketLike deliberately omits; the runtime shapes line up.
  return ws as unknown as SocketLike;
}

/**
 * Open (and keep open) the live channel for a room. Emits `open` on every
 * (re)connect, `update` per broadcast, `reconnecting` while retrying with
 * exponential backoff + jitter, and a terminal `closed` for revocation, a
 * gone room, or after `maxAttempts` consecutive failures.
 */
export function connectLive({
  roomId,
  token,
  onEvent,
  createSocket = defaultCreateSocket,
  pingIntervalMs = 30_000,
  maxAttempts = 8,
}: ConnectLiveOptions): LiveConnection {
  let socket: SocketLike | null = null;
  let closedByUser = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const stopPing = () => {
    if (pingTimer !== null) clearInterval(pingTimer);
    pingTimer = null;
  };

  const startPing = () => {
    stopPing();
    pingTimer = setInterval(() => {
      try {
        socket?.send("ping");
      } catch {
        // Socket is mid-close; the close handler takes over.
      }
    }, pingIntervalMs);
  };

  const scheduleReconnect = () => {
    attempt += 1;
    if (attempt > maxAttempts) {
      onEvent({ type: "closed", reason: "failed" });
      return;
    }
    onEvent({ type: "reconnecting", attempt });
    // 500ms · 2^n capped at 15s, with 50–100% jitter to avoid thundering herds.
    const backoff = Math.min(15_000, 500 * 2 ** (attempt - 1));
    const delay = backoff * (0.5 + Math.random() * 0.5);
    reconnectTimer = setTimeout(open, delay);
  };

  const open = () => {
    reconnectTimer = null;
    const ws = createSocket(roomId, token);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      startPing();
      onEvent({ type: "open" });
    };
    ws.onmessage = (event) => {
      const parsed = parseLiveFrame(event.data);
      // Silently skip unrecognised frames ("pong" keepalives, unknown versions).
      if (parsed.ok) onEvent(parsed.value);
    };
    ws.onerror = () => {
      // The close event (which always follows) drives the state machine.
    };
    ws.onclose = (event) => {
      stopPing();
      if (closedByUser) return;
      if (event.code === CLOSE_REVOKED) {
        onEvent({ type: "closed", reason: "revoked" });
        return;
      }
      if (event.code === CLOSE_ROOM_GONE) {
        onEvent({ type: "closed", reason: "room-gone" });
        return;
      }
      scheduleReconnect();
    };
  };

  open();

  return {
    close() {
      closedByUser = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      stopPing();
      try {
        socket?.close(1000, "client closed");
      } catch {
        // Already closed.
      }
    },
  };
}
