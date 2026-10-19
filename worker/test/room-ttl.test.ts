import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimit } from "../src/index";
import {
  bearer,
  call,
  connectWs,
  nextMessage,
  resetDb,
  roomTtl,
  seedMember,
  seedRoom,
} from "./helpers";

const HOUR = 3_600_000;
const TEN_MIN = 600_000;
const MINUTE = 60_000;

function push(
  roomId: string,
  token: string,
  ttlMs?: number,
  ip = "7.0.0.1",
): Promise<Response> {
  return call("/api/clipboard", {
    method: "POST",
    headers: { "content-type": "application/json", ...bearer(token, ip) },
    body: JSON.stringify({
      roomId,
      ciphertext: "Q1R4",
      iv: "SVY",
      ...(ttlMs !== undefined ? { ttlMs } : {}),
    }),
  });
}

function putTtl(
  roomId: string,
  token: string | null,
  body: unknown,
  ip = "7.0.0.2",
): Promise<Response> {
  return call(`/api/rooms/${roomId}/ttl`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(token === null ? { "CF-Connecting-IP": ip } : bearer(token, ip)),
    },
    body: JSON.stringify(body),
  });
}

/** `expiresAt` landed at `now + ttl` (with slack for test execution time). */
function expectExpiry(expiresAt: number, before: number, ttl: number): void {
  expect(expiresAt).toBeGreaterThanOrEqual(before + ttl);
  expect(expiresAt).toBeLessThanOrEqual(Date.now() + ttl);
}

beforeEach(async () => {
  __resetRateLimit();
  await resetDb();
});

describe("room TTL is owned by the creator", () => {
  it("stores the default TTL at creation and returns it to creator and joiner", async () => {
    const create = await call("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "7.1.0.1" },
      body: JSON.stringify({ roomId: "fresh", mode: "create" }),
    });
    expect(create.status).toBe(200);
    expect(((await create.json()) as { ttlMs: number }).ttlMs).toBe(TEN_MIN);

    const join = await call("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "7.1.0.2" },
      body: JSON.stringify({ roomId: "fresh", mode: "join" }),
    });
    expect(join.status).toBe(200);
    expect(((await join.json()) as { ttlMs: number }).ttlMs).toBe(TEN_MIN);
    expect(await roomTtl("fresh")).toBe(TEN_MIN);
  });

  it("a joiner push inherits the creator's TTL and its ttlMs is ignored", async () => {
    await seedRoom("r", { ttlMs: HOUR });
    const joiner = await seedMember("r", "tok-joiner", "joiner");

    const before = Date.now();
    const res = await push("r", joiner, TEN_MIN);
    expect(res.status).toBe(200);
    expectExpiry(((await res.json()) as { expiresAt: number }).expiresAt, before, HOUR);
    expect(await roomTtl("r")).toBe(HOUR);
  });

  it("a push without ttlMs re-arms the expiry from the stored TTL", async () => {
    await seedRoom("r", { ttlMs: MINUTE });
    const creator = await seedMember("r", "tok-creator", "creator");

    const before = Date.now();
    const res = await push("r", creator);
    expect(res.status).toBe(200);
    expectExpiry(((await res.json()) as { expiresAt: number }).expiresAt, before, MINUTE);
    expect(await roomTtl("r")).toBe(MINUTE);
  });

  it("a creator push carrying ttlMs (legacy client) updates the stored TTL, clamped", async () => {
    await seedRoom("r");
    const creator = await seedMember("r", "tok-creator", "creator");

    const res = await push("r", creator, HOUR * 5);
    expect(res.status).toBe(200);
    expect(await roomTtl("r")).toBe(HOUR); // clamped to TTL_MAX_MS
  });
});

describe("PUT /api/rooms/:roomId/ttl", () => {
  it("lets the creator change the TTL, restarting the expiry now", async () => {
    await seedRoom("r");
    const creator = await seedMember("r", "tok-creator", "creator");

    const before = Date.now();
    const res = await putTtl("r", creator, { ttlMs: HOUR });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ttlMs: number; expiresAt: number };
    expect(body.ok).toBe(true);
    expect(body.ttlMs).toBe(HOUR);
    expectExpiry(body.expiresAt, before, HOUR);
    expect(await roomTtl("r")).toBe(HOUR);
  });

  it("applies to a joiner's next push (the reported bug)", async () => {
    await seedRoom("r", { capacity: 2 });
    const creator = await seedMember("r", "tok-creator", "creator");
    const joiner = await seedMember("r", "tok-joiner", "joiner");

    expect((await putTtl("r", creator, { ttlMs: HOUR })).status).toBe(200);
    const before = Date.now();
    const res = await push("r", joiner, TEN_MIN); // stale client default
    expectExpiry(((await res.json()) as { expiresAt: number }).expiresAt, before, HOUR);
  });

  it("clamps a TTL above the maximum", async () => {
    await seedRoom("r");
    const creator = await seedMember("r", "tok-creator", "creator");
    const res = await putTtl("r", creator, { ttlMs: HOUR * 24 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ttlMs: number }).ttlMs).toBe(HOUR);
  });

  it("rejects a joiner (403), a non-member (401), and a bad body (400)", async () => {
    await seedRoom("r");
    await seedMember("r", "tok-creator", "creator");
    const joiner = await seedMember("r", "tok-joiner", "joiner");

    expect((await putTtl("r", joiner, { ttlMs: HOUR })).status).toBe(403);
    expect((await putTtl("r", "not-a-member", { ttlMs: HOUR })).status).toBe(401);
    expect((await putTtl("r", null, { ttlMs: HOUR })).status).toBe(401);
    for (const bad of [{}, { ttlMs: "1h" }, { ttlMs: 0 }, { ttlMs: -1 }]) {
      expect((await putTtl("r", "tok-creator", bad)).status).toBe(400);
    }
    expect(await roomTtl("r")).toBe(TEN_MIN);
  });

  it("404s for an expired room and never resurrects it", async () => {
    await seedRoom("dead", { expiresAt: Date.now() - 1 });
    const creator = await seedMember("dead", "tok-creator", "creator");
    expect((await putTtl("dead", creator, { ttlMs: HOUR })).status).toBe(404);
  });

  it("broadcasts the new expiry to every live socket (no content)", async () => {
    await seedRoom("live", { syncMode: "push", capacity: 2 });
    const creator = await seedMember("live", "tok-creator", "creator");
    const joiner = await seedMember("live", "tok-joiner", "joiner");
    const a = await connectWs("live", creator, "7.2.0.1");
    const b = await connectWs("live", joiner, "7.2.0.2");
    if (!a.ws || !b.ws) throw new Error("sockets missing");

    const creatorFrame = nextMessage(a.ws);
    const joinerFrame = nextMessage(b.ws);
    const res = await putTtl("live", creator, { ttlMs: MINUTE });
    expect(res.status).toBe(200);
    const { expiresAt } = (await res.json()) as { expiresAt: number };

    for (const raw of [await joinerFrame, await creatorFrame]) {
      expect(JSON.parse(raw)).toEqual({ v: 1, type: "expiry", expiresAt });
    }
  });
});
