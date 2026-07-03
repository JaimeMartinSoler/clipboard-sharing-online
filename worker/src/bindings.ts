/**
 * Worker environment bindings. Lives in its own module (rather than index.ts)
 * so both the Hono app and the RoomDO Durable Object can import it without an
 * import cycle.
 */
import type { RoomDO } from "./room-do";

export interface Bindings {
  DB: D1Database;
  /** One Durable Object per live room: WebSocket fanout (see room-do.ts). */
  ROOM: DurableObjectNamespace<RoomDO>;
  TTL_DEFAULT_MS: string;
  TTL_MAX_MS: string;
  MAX_CIPHERTEXT_BYTES: string;
  RATE_LIMIT_MAX: string;
  RATE_LIMIT_WINDOW_MS: string;
}
