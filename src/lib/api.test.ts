import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  clearClipboard,
  joinRoom,
  pullClipboard,
  pushClipboard,
} from "./api";

function mockFetch(response: Response | (() => Response | Promise<Response>)) {
  const fn = vi.fn(async () =>
    typeof response === "function" ? response() : response,
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastCall(fn: ReturnType<typeof vi.fn>): [string, RequestInit] {
  const call = fn.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return [call[0] as string, (call[1] ?? {}) as RequestInit];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("joinRoom", () => {
  it("returns the join payload and posts roomId + capacity to /api/rooms", async () => {
    const fetchMock = mockFetch(
      json({ token: "tok", joined: 1, capacity: 2, sealed: false }),
    );
    const res = await joinRoom("room-1", 2);
    expect(res).toEqual({
      ok: true,
      value: { token: "tok", joined: 1, capacity: 2, sealed: false },
    });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/rooms");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      roomId: "room-1",
      capacity: 2,
    });
  });

  it("maps 409 to a sealed error", async () => {
    mockFetch(json({ error: "sealed" }, 409));
    expect(await joinRoom("r", 2)).toEqual({ ok: false, error: ApiError.SEALED });
  });

  it("maps 400 to a bad-request error", async () => {
    mockFetch(json({ error: "bad" }, 400));
    expect(await joinRoom("r", 99)).toEqual({
      ok: false,
      error: ApiError.BAD_REQUEST,
    });
  });

  it("maps a network failure to a network error", async () => {
    mockFetch(() => {
      throw new TypeError("offline");
    });
    expect(await joinRoom("r", 2)).toEqual({
      ok: false,
      error: ApiError.NETWORK,
    });
  });
});

describe("pushClipboard", () => {
  it("attaches the Bearer token and sends ONLY roomId + ciphertext + iv", async () => {
    const fetchMock = mockFetch(json({ ok: true, expiresAt: 123 }));
    const res = await pushClipboard("room-1", "secret-token", {
      ciphertext: "CT",
      iv: "IV",
    });
    expect(res).toEqual({ ok: true, value: { ok: true, expiresAt: 123 } });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/clipboard");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");

    const body = JSON.parse(init.body as string);
    // No password, no plaintext, no token in the body — exactly three keys.
    expect(Object.keys(body).sort()).toEqual(["ciphertext", "iv", "roomId"]);
    expect(body).toEqual({ roomId: "room-1", ciphertext: "CT", iv: "IV" });
  });

  it("includes ttlMs only when provided", async () => {
    const fetchMock = mockFetch(json({ ok: true, expiresAt: 1 }));
    await pushClipboard("r", "t", { ciphertext: "CT", iv: "IV" }, 60000);
    const [, init] = lastCall(fetchMock);
    expect(JSON.parse(init.body as string).ttlMs).toBe(60000);
  });

  it("maps 401 → slot lost, 413 → too large, 404 → empty", async () => {
    mockFetch(json({}, 401));
    expect((await pushClipboard("r", "t", { ciphertext: "C", iv: "I" })).ok).toBe(
      false,
    );
    expect(await pushClipboard("r", "t", { ciphertext: "C", iv: "I" })).toEqual({
      ok: false,
      error: ApiError.SLOT_LOST,
    });

    mockFetch(json({}, 413));
    expect(await pushClipboard("r", "t", { ciphertext: "C", iv: "I" })).toEqual({
      ok: false,
      error: ApiError.TOO_LARGE,
    });

    mockFetch(json({}, 404));
    expect(await pushClipboard("r", "t", { ciphertext: "C", iv: "I" })).toEqual({
      ok: false,
      error: ApiError.EMPTY,
    });
  });
});

describe("pullClipboard", () => {
  it("returns the blob and attaches the Bearer token", async () => {
    const fetchMock = mockFetch(
      json({ ciphertext: "CT", iv: "IV", expiresAt: 9 }),
    );
    const res = await pullClipboard("room-1", "tok");
    expect(res).toEqual({
      ok: true,
      value: { ciphertext: "CT", iv: "IV", expiresAt: 9 },
    });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/clipboard/room-1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
  });

  it("maps 404 to the empty error (no oracle)", async () => {
    mockFetch(json({}, 404));
    expect(await pullClipboard("r", "t")).toEqual({
      ok: false,
      error: ApiError.EMPTY,
    });
  });

  it("maps 401 to slot lost", async () => {
    mockFetch(json({}, 401));
    expect(await pullClipboard("r", "t")).toEqual({
      ok: false,
      error: ApiError.SLOT_LOST,
    });
  });
});

describe("clearClipboard", () => {
  it("returns ok on 204", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));
    const res = await clearClipboard("room-1", "tok");
    expect(res).toEqual({ ok: true, value: undefined });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/clipboard/room-1");
    expect(init.method).toBe("DELETE");
  });

  it("maps 401 to slot lost", async () => {
    mockFetch(json({}, 401));
    expect(await clearClipboard("r", "t")).toEqual({
      ok: false,
      error: ApiError.SLOT_LOST,
    });
  });
});
