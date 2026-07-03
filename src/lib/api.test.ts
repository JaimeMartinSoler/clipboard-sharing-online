import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  clearClipboard,
  deleteRoom,
  joinRoom,
  listMembers,
  pullClipboard,
  pushClipboard,
  removeMember,
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
  it("posts roomId + capacity + mode + syncMode and returns role + mode", async () => {
    const fetchMock = mockFetch(
      json({
        token: "tok",
        joined: 1,
        capacity: 2,
        sealed: false,
        role: "creator",
        syncMode: "push",
      }),
    );
    const res = await joinRoom("room-1", 2, "create", "push");
    expect(res).toEqual({
      ok: true,
      value: {
        token: "tok",
        joined: 1,
        capacity: 2,
        sealed: false,
        role: "creator",
        syncMode: "push",
      },
    });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/rooms");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      roomId: "room-1",
      capacity: 2,
      mode: "create",
      syncMode: "push",
    });
  });

  it("defaults syncMode to manual when omitted", async () => {
    const fetchMock = mockFetch(
      json({ token: "t", joined: 1, capacity: 2, sealed: false, role: "joiner", syncMode: "manual" }),
    );
    await joinRoom("room-1", 2, "join");
    const [, init] = lastCall(fetchMock);
    expect(JSON.parse(init.body as string).syncMode).toBe("manual");
  });

  it("maps 409 to EXISTS on create and SEALED on join", async () => {
    mockFetch(json({ error: "exists" }, 409));
    expect(await joinRoom("r", 2, "create")).toEqual({
      ok: false,
      error: ApiError.EXISTS,
    });
    mockFetch(json({ error: "sealed" }, 409));
    expect(await joinRoom("r", 2, "join")).toEqual({
      ok: false,
      error: ApiError.SEALED,
    });
  });

  it("maps 404 (join a missing room) to ROOM_NOT_FOUND", async () => {
    mockFetch(json({ error: "not found" }, 404));
    expect(await joinRoom("r", 2, "join")).toEqual({
      ok: false,
      error: ApiError.ROOM_NOT_FOUND,
    });
  });

  it("maps 400 to a bad-request error", async () => {
    mockFetch(json({ error: "bad" }, 400));
    expect(await joinRoom("r", 99, "create")).toEqual({
      ok: false,
      error: ApiError.BAD_REQUEST,
    });
  });

  it("maps a network failure to a network error", async () => {
    mockFetch(() => {
      throw new TypeError("offline");
    });
    expect(await joinRoom("r", 2, "join")).toEqual({
      ok: false,
      error: ApiError.NETWORK,
    });
  });
});

describe("creator-only room management", () => {
  it("listMembers returns the members array and attaches the token", async () => {
    const members = [
      { id: 1, role: "creator", joinedAt: 10 },
      { id: 2, role: "joiner", joinedAt: 20 },
    ];
    const fetchMock = mockFetch(json({ members }));
    const res = await listMembers("room-1", "tok");
    expect(res).toEqual({ ok: true, value: members });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/rooms/room-1/members");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
  });

  it("listMembers maps 403 to FORBIDDEN and 401 to SLOT_LOST", async () => {
    mockFetch(json({}, 403));
    expect(await listMembers("r", "t")).toEqual({
      ok: false,
      error: ApiError.FORBIDDEN,
    });
    mockFetch(json({}, 401));
    expect(await listMembers("r", "t")).toEqual({
      ok: false,
      error: ApiError.SLOT_LOST,
    });
  });

  it("removeMember DELETEs the member path with the token", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }));
    const res = await removeMember("room-1", "tok", 7);
    expect(res).toEqual({ ok: true, value: undefined });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/rooms/room-1/members/7");
    expect(init.method).toBe("DELETE");
  });

  it("removeMember maps 403 to FORBIDDEN", async () => {
    mockFetch(json({}, 403));
    expect(await removeMember("r", "t", 1)).toEqual({
      ok: false,
      error: ApiError.FORBIDDEN,
    });
  });

  it("deleteRoom DELETEs the room path and returns ok on 204", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));
    const res = await deleteRoom("room-1", "tok");
    expect(res).toEqual({ ok: true, value: undefined });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/rooms/room-1");
    expect(init.method).toBe("DELETE");
  });

  it("deleteRoom maps 403 to FORBIDDEN and 401 to SLOT_LOST", async () => {
    mockFetch(json({}, 403));
    expect(await deleteRoom("r", "t")).toEqual({
      ok: false,
      error: ApiError.FORBIDDEN,
    });
    mockFetch(json({}, 401));
    expect(await deleteRoom("r", "t")).toEqual({
      ok: false,
      error: ApiError.SLOT_LOST,
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

  it("maps 401 → slot lost, 413 → too large, 404 → room gone", async () => {
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

    // A push 404 means the room is gone (not an empty pull) → rejoin nudge.
    mockFetch(json({}, 404));
    expect(await pushClipboard("r", "t", { ciphertext: "C", iv: "I" })).toEqual({
      ok: false,
      error: ApiError.ROOM_GONE,
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
