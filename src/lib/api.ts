/**
 * Same-origin API client for the Worker. Every function returns a `Result` and
 * never throws — network and HTTP failures become `Result` errors the UI can
 * render in the StatusBanner. The membership token is passed in by the caller
 * (the UI holds it in memory only) so this module stays stateless and testable.
 *
 * What leaves the browser here is only `{ roomId, ciphertext, iv }` plus the
 * opaque Bearer token — never the password, keys, or plaintext.
 */
import type { EncryptedPayload } from "./crypto";
import { err, ok, type Result } from "./result";

/** Same-origin: the Worker is bound to `/api/*` on the Pages custom domain. */
const API_BASE = "/api";

/**
 * Stable error strings. Exported so the UI can map a failure to the right
 * banner severity/message without brittle substring matching.
 */
export const ApiError = {
  NETWORK: "Network error — couldn't reach the server.",
  BAD_REQUEST: "The server rejected the request.",
  /** 401: membership gone (reload/closed tab forfeits the in-memory slot). */
  SLOT_LOST: "Your slot was lost — rejoin to continue.",
  /** 409: the room filled up before this join. */
  SEALED: "Room is sealed — no free slot.",
  /** 404: nothing to pull (empty room or wrong password — indistinguishable). */
  EMPTY: "No data in this room (or wrong password).",
  /** 404 on push: the room expired/vanished before this upload landed. */
  ROOM_GONE: "This room expired — rejoin to keep sharing.",
  /** 413: encrypted payload exceeds the server's size cap. */
  TOO_LARGE: "Text is too large to share — try less content.",
  SERVER: "The server had a problem. Please try again.",
} as const;

export interface JoinResponse {
  token: string;
  joined: number;
  capacity: number;
  sealed: boolean;
}

export interface PushResponse {
  expiresAt: number;
}

export interface PullResponse {
  ciphertext: string;
  iv: string;
  expiresAt: number;
}

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return ok((await res.json()) as T);
  } catch {
    return err(ApiError.SERVER);
  }
}

/** Join (or create) a room and claim a slot. */
export async function joinRoom(
  roomId: string,
  capacity: number,
): Promise<Result<JoinResponse>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, capacity }),
    });
  } catch {
    return err(ApiError.NETWORK);
  }
  if (res.status === 409) return err(ApiError.SEALED);
  if (res.status === 400) return err(ApiError.BAD_REQUEST);
  if (!res.ok) return err(ApiError.SERVER);
  return readJson<JoinResponse>(res);
}

/** Encrypt-then-upload: replaces the room's blob and resets its TTL. */
export async function pushClipboard(
  roomId: string,
  token: string,
  payload: EncryptedPayload,
  ttlMs?: number,
): Promise<Result<PushResponse>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/clipboard`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        roomId,
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        ...(ttlMs !== undefined ? { ttlMs } : {}),
      }),
    });
  } catch {
    return err(ApiError.NETWORK);
  }
  if (res.status === 401) return err(ApiError.SLOT_LOST);
  if (res.status === 413) return err(ApiError.TOO_LARGE);
  // A push to a missing/expired room is an upload failure, not an empty pull:
  // surface a rejoin nudge rather than the "no data / wrong password" copy.
  if (res.status === 404) return err(ApiError.ROOM_GONE);
  if (!res.ok) return err(ApiError.SERVER);
  return readJson<PushResponse>(res);
}

/** Download the room's blob (caller decrypts). 404 → typed EMPTY error. */
export async function pullClipboard(
  roomId: string,
  token: string,
): Promise<Result<PullResponse>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/clipboard/${encodeURIComponent(roomId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return err(ApiError.NETWORK);
  }
  if (res.status === 401) return err(ApiError.SLOT_LOST);
  if (res.status === 404) return err(ApiError.EMPTY);
  if (!res.ok) return err(ApiError.SERVER);
  return readJson<PullResponse>(res);
}

/** Clear the room's blob. Idempotent server-side; 204 on success. */
export async function clearClipboard(
  roomId: string,
  token: string,
): Promise<Result<void>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/clipboard/${encodeURIComponent(roomId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return err(ApiError.NETWORK);
  }
  if (res.status === 401) return err(ApiError.SLOT_LOST);
  if (res.status === 204 || res.ok) return ok(undefined);
  return err(ApiError.SERVER);
}
