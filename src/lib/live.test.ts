import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectLive,
  type LiveEvent,
  parseLiveFrame,
  parseLiveMessage,
  type SocketLike,
  wsUrl,
} from "./live";

/** A scripted stand-in for the browser WebSocket. */
class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
  }
}

function harness(overrides: { maxAttempts?: number } = {}) {
  const sockets: FakeSocket[] = [];
  const events: LiveEvent[] = [];
  const connection = connectLive({
    roomId: "room-1",
    token: "tok",
    onEvent: (e) => events.push(e),
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    pingIntervalMs: 30_000,
    ...overrides,
  });
  return { sockets, events, connection };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("wsUrl", () => {
  it("targets the same origin with wss on https", () => {
    expect(wsUrl("abc", { protocol: "https:", host: "clipboard-sharing-online.com" })).toBe(
      "wss://clipboard-sharing-online.com/api/rooms/abc/ws",
    );
  });

  it("bypasses the next dev proxy (no WS support) toward wrangler dev", () => {
    expect(wsUrl("abc", { protocol: "http:", host: "localhost:3000" })).toBe(
      "ws://127.0.0.1:8787/api/rooms/abc/ws",
    );
    expect(wsUrl("abc", { protocol: "http:", host: "127.0.0.1:3000" })).toBe(
      "ws://127.0.0.1:8787/api/rooms/abc/ws",
    );
  });

  it("percent-encodes the room id", () => {
    expect(wsUrl("a/b", { protocol: "https:", host: "x.com" })).toBe(
      "wss://x.com/api/rooms/a%2Fb/ws",
    );
  });
});

describe("parseLiveMessage", () => {
  const frame = { v: 1, type: "update", ciphertext: "Q1R4", iv: "SVY", expiresAt: 123 };

  it("accepts a well-formed update frame", () => {
    const res = parseLiveMessage(JSON.stringify(frame));
    expect(res).toEqual({ ok: true, value: { ciphertext: "Q1R4", iv: "SVY", expiresAt: 123 } });
  });

  it("rejects pongs, non-JSON, wrong versions, and bad fields", () => {
    expect(parseLiveMessage("pong").ok).toBe(false);
    expect(parseLiveMessage(12).ok).toBe(false);
    expect(parseLiveMessage(JSON.stringify({ ...frame, v: 2 })).ok).toBe(false);
    expect(parseLiveMessage(JSON.stringify({ ...frame, type: "nudge" })).ok).toBe(false);
    expect(parseLiveMessage(JSON.stringify({ ...frame, ciphertext: "not base64url!" })).ok).toBe(false);
    expect(parseLiveMessage(JSON.stringify({ ...frame, iv: "" })).ok).toBe(false);
    expect(parseLiveMessage(JSON.stringify({ ...frame, expiresAt: "soon" })).ok).toBe(false);
  });
});

describe("parseLiveFrame", () => {
  it("recognises a data-less roster nudge", () => {
    expect(parseLiveFrame(JSON.stringify({ v: 1, type: "roster" }))).toEqual({
      ok: true,
      value: { type: "roster" },
    });
  });

  it("wraps a valid update frame", () => {
    const frame = { v: 1, type: "update", ciphertext: "Q1R4", iv: "SVY", expiresAt: 7 };
    expect(parseLiveFrame(JSON.stringify(frame))).toEqual({
      ok: true,
      value: { type: "update", update: { ciphertext: "Q1R4", iv: "SVY", expiresAt: 7 } },
    });
  });

  it("rejects pongs, wrong versions, and malformed update frames", () => {
    expect(parseLiveFrame("pong").ok).toBe(false);
    expect(parseLiveFrame(JSON.stringify({ v: 2, type: "roster" })).ok).toBe(false);
    expect(parseLiveFrame(JSON.stringify({ v: 1, type: "nudge" })).ok).toBe(false);
    expect(
      parseLiveFrame(JSON.stringify({ v: 1, type: "update", ciphertext: "!", iv: "SVY", expiresAt: 1 })).ok,
    ).toBe(false);
  });
});

describe("connectLive", () => {
  it("emits open and forwards parsed updates", () => {
    const { sockets, events } = harness();
    const ws = sockets[0]!;
    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({ v: 1, type: "update", ciphertext: "Q1R4", iv: "SVY", expiresAt: 9 }),
    });
    ws.onmessage?.({ data: "pong" }); // keepalive answer — ignored

    expect(events).toEqual([
      { type: "open" },
      { type: "update", update: { ciphertext: "Q1R4", iv: "SVY", expiresAt: 9 } },
    ]);
  });

  it("forwards a roster nudge as a roster event", () => {
    const { sockets, events } = harness();
    const ws = sockets[0]!;
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ v: 1, type: "roster" }) });

    expect(events).toEqual([{ type: "open" }, { type: "roster" }]);
  });

  it("sends keepalive pings while open", () => {
    const { sockets } = harness();
    const ws = sockets[0]!;
    ws.onopen?.();
    vi.advanceTimersByTime(90_000);
    expect(ws.sent).toEqual(["ping", "ping", "ping"]);
  });

  it("reconnects with backoff after an unexpected close, then resets", () => {
    const { sockets, events } = harness();
    sockets[0]!.onopen?.();
    sockets[0]!.onclose?.({ code: 1006 });

    expect(events).toContainEqual({ type: "reconnecting", attempt: 1 });
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(500); // max first backoff (with jitter ≤ 500ms)
    expect(sockets).toHaveLength(2);

    sockets[1]!.onopen?.(); // success resets the attempt counter
    sockets[1]!.onclose?.({ code: 1006 });
    expect(events.filter((e) => e.type === "reconnecting")).toEqual([
      { type: "reconnecting", attempt: 1 },
      { type: "reconnecting", attempt: 1 },
    ]);
  });

  it("gives up with closed:failed after maxAttempts consecutive failures", () => {
    const { sockets, events } = harness({ maxAttempts: 2 });
    sockets[0]!.onclose?.({ code: 1006 }); // attempt 1 scheduled
    vi.runOnlyPendingTimers();
    sockets[1]!.onclose?.({ code: 1006 }); // attempt 2 scheduled
    vi.runOnlyPendingTimers();
    sockets[2]!.onclose?.({ code: 1006 }); // exceeds maxAttempts

    expect(events.at(-1)).toEqual({ type: "closed", reason: "failed" });
    expect(sockets).toHaveLength(3);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(3); // no further retries
  });

  it("treats 4001/4004 as terminal (revoked / room gone)", () => {
    const a = harness();
    a.sockets[0]!.onopen?.();
    a.sockets[0]!.onclose?.({ code: 4001 });
    expect(a.events.at(-1)).toEqual({ type: "closed", reason: "revoked" });

    const b = harness();
    b.sockets[0]!.onopen?.();
    b.sockets[0]!.onclose?.({ code: 4004 });
    expect(b.events.at(-1)).toEqual({ type: "closed", reason: "room-gone" });

    vi.advanceTimersByTime(60_000);
    expect(a.sockets).toHaveLength(1);
    expect(b.sockets).toHaveLength(1);
  });

  it("close() is silent: no more events, no reconnect, socket closed", () => {
    const { sockets, events, connection } = harness();
    const ws = sockets[0]!;
    ws.onopen?.();
    connection.close();
    ws.onclose?.({ code: 1000 }); // browser fires close after close()

    expect(ws.closedWith).toEqual({ code: 1000, reason: "client closed" });
    expect(events).toEqual([{ type: "open" }]);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(ws.sent).toEqual([]); // ping loop stopped
  });
});
