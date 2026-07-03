/**
 * RoomDO — one Durable Object per live room, addressed by `idFromName(roomId)`.
 *
 * It is a coordination/fanout layer only: it holds the room's WebSockets and,
 * for live-mode pushes, performs the D1 write + broadcast in one serialized
 * turn (the DO's input gate gives every room a total order of pushes for
 * free). D1 remains the single source of truth — the DO stores no content,
 * only its expiry alarm.
 *
 * Zero-knowledge invariants: everything transiting here is ciphertext + iv.
 * The raw membership token never reaches this class — the Worker validates the
 * Bearer token against D1 *before* forwarding the upgrade and passes only the
 * SHA-256 token hash, which tags each socket (via `serializeAttachment`) for
 * echo suppression and revocation.
 *
 * Hibernation: sockets are accepted with `ctx.acceptWebSocket` and keepalive
 * pings are answered by `setWebSocketAutoResponse`, so an idle room is evicted
 * from memory (billing ~zero duration) while its sockets stay connected.
 */
import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "./bindings";
import { setClipboard } from "./db";

/** Terminal close codes the client must NOT reconnect after. */
export const WS_CLOSE_REVOKED = 4001;
export const WS_CLOSE_ROOM_GONE = 4004;

/** Internal headers set by the Worker on the forwarded, pre-authed upgrade. */
export const HDR_TOKEN_HASH = "X-CSO-Token-Hash";
export const HDR_EXPIRES_AT = "X-CSO-Expires-At";

/** The subprotocol echoed to the browser (its auth twin is stripped upstream). */
export const WS_PROTOCOL = "cso.v1";

export interface PushMessage {
  roomId: string;
  ciphertext: string;
  iv: string;
  expiresAt: number;
  now: number;
  /** SHA-256 hash of the pusher's token — their own sockets are skipped. */
  pusherTokenHash: string;
}

interface SocketAttachment {
  tokenHash: string;
}

export class RoomDO extends DurableObject<Bindings> {
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    // Keepalives are answered by the runtime without waking a hibernated DO.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  /**
   * Accept a WebSocket upgrade that the Worker has ALREADY authenticated
   * (Bearer token validated against D1). Trust boundary: this fetch is only
   * reachable via the ROOM binding, never from the internet directly.
   */
  async fetch(request: Request): Promise<Response> {
    const tokenHash = request.headers.get(HDR_TOKEN_HASH);
    const expiresAt = Number(request.headers.get(HDR_EXPIRES_AT));
    if (
      request.headers.get("Upgrade")?.toLowerCase() !== "websocket" ||
      tokenHash === null ||
      !Number.isFinite(expiresAt)
    ) {
      return new Response("Expected an authenticated WebSocket upgrade", {
        status: 400,
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // Hibernation-aware accept; the attachment survives eviction and is how a
    // socket is matched for echo suppression and revocation.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ tokenHash } satisfies SocketAttachment);
    await this.ctx.storage.setAlarm(expiresAt);

    return new Response(null, {
      status: 101,
      webSocket: client,
      // Browsers require the selected subprotocol to be echoed back.
      headers: { "Sec-WebSocket-Protocol": WS_PROTOCOL },
    });
  }

  /**
   * Live-mode push: write the blob to D1 and broadcast it, serialized with all
   * other pushes to this room. Returns false when the room is missing/expired
   * (the Worker maps that to 404) — `setClipboard`'s liveness guard means a
   * racing expiry can never be resurrected here.
   */
  async push(p: PushMessage): Promise<boolean> {
    const stored = await setClipboard(
      this.env.DB,
      p.roomId,
      p.ciphertext,
      p.iv,
      p.expiresAt,
      p.now,
    );
    if (!stored) return false;

    // Each push (re)sets the room TTL; keep the expiry alarm in step.
    await this.ctx.storage.setAlarm(p.expiresAt);

    const message = JSON.stringify({
      v: 1,
      type: "update",
      ciphertext: p.ciphertext,
      iv: p.iv,
      expiresAt: p.expiresAt,
    });
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.tokenHash === p.pusherTokenHash) continue;
      try {
        ws.send(message);
      } catch {
        // Socket already closing/errored; the runtime reaps it.
      }
    }
    return true;
  }

  /** Sever a revoked member's sockets. Their slot stays sealed regardless. */
  async closeMember(tokenHash: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.tokenHash !== tokenHash) continue;
      try {
        ws.close(WS_CLOSE_REVOKED, "revoked");
      } catch {
        // Already closed.
      }
    }
  }

  /** Room nuked (or expired): close everything and drop the alarm. */
  async closeAll(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(WS_CLOSE_ROOM_GONE, "room gone");
      } catch {
        // Already closed.
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /**
   * TTL expiry. Every path that extends `expires_at` (connect reads it fresh
   * from D1; push rewrites it) also slides this alarm, and the DO's input gate
   * means a push can never interleave with the alarm — so when it fires, the
   * room really is past its TTL. The cron/lazy delete handles the D1 rows.
   */
  async alarm(): Promise<void> {
    await this.closeAll();
  }

  async webSocketMessage(): Promise<void> {
    // Downstream-only channel: pings are auto-answered, anything else ignored.
  }

  async webSocketClose(): Promise<void> {
    // Nothing to clean up — attachments die with the socket.
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      // Already closed.
    }
  }
}
