import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimit, handleScheduled } from "../src/index";
import {
  call,
  memberCount,
  resetDb,
  roomCount,
  seedMember,
  seedRoom,
} from "./helpers";

interface JoinOk {
  token: string;
  joined: number;
  capacity: number;
  sealed: boolean;
}

function join(
  roomId: string,
  capacity: number | undefined,
  ip: string,
): Promise<Response> {
  const body =
    capacity === undefined ? { roomId } : { roomId, capacity };
  return call("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  __resetRateLimit();
  await resetDb();
});

describe("POST /api/rooms — join, seal, capacity", () => {
  it("creates a room, returns a token, and reports slot/seal state", async () => {
    const first = await join("room-1", 2, "10.0.0.1");
    expect(first.status).toBe(200);
    const a = (await first.json()) as JoinOk;
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.joined).toBe(1);
    expect(a.capacity).toBe(2);
    expect(a.sealed).toBe(false);

    const second = await join("room-1", 2, "10.0.0.2");
    expect(second.status).toBe(200);
    const b = (await second.json()) as JoinOk;
    expect(b.joined).toBe(2);
    expect(b.sealed).toBe(true);
    expect(b.token).not.toBe(a.token);

    const third = await join("room-1", 2, "10.0.0.3");
    expect(third.status).toBe(409); // sealed
  });

  it("defaults capacity to 2 when omitted", async () => {
    const res = await join("room-default", undefined, "10.0.1.1");
    const body = (await res.json()) as JoinOk;
    expect(body.capacity).toBe(2);
  });

  it("400s on bad capacity (0, 11, non-integer, non-number)", async () => {
    expect((await join("rc0", 0, "10.0.2.1")).status).toBe(400);
    expect((await join("rc11", 11, "10.0.2.2")).status).toBe(400);
    expect((await join("rcf", 2.5, "10.0.2.3")).status).toBe(400);
    const bad = await call("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "10.0.2.4" },
      body: JSON.stringify({ roomId: "rcs", capacity: "two" }),
    });
    expect(bad.status).toBe(400);
  });

  it("never over-seals past capacity under concurrent joins", async () => {
    const roomId = "race-room";
    const capacity = 3;
    const attempts = 8;
    const responses = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        join(roomId, capacity, `10.1.0.${i + 1}`),
      ),
    );
    const statuses = responses.map((r) => r.status);
    const granted = statuses.filter((s) => s === 200).length;
    const rejected = statuses.filter((s) => s === 409).length;

    expect(granted).toBe(capacity);
    expect(rejected).toBe(attempts - capacity);
    expect(await memberCount(roomId)).toBe(capacity);
  });
});

describe("bearer enforcement on clipboard ops", () => {
  it("401s without an Authorization header", async () => {
    await seedRoom("r");
    await seedMember("r", "tok");
    const res = await call("/api/clipboard/r", {
      headers: { "CF-Connecting-IP": "11.0.0.1" },
    });
    expect(res.status).toBe(401);
  });

  it("401s with a wrong token", async () => {
    await seedRoom("r");
    await seedMember("r", "tok");
    const res = await call("/api/clipboard/r", {
      headers: { Authorization: "Bearer not-the-token", "CF-Connecting-IP": "11.0.0.2" },
    });
    expect(res.status).toBe(401);
  });

  it("authorizes a token from a real join end-to-end (push + pull)", async () => {
    const roomId = "join-e2e";
    const joinRes = await join(roomId, 2, "12.0.0.1");
    const { token } = (await joinRes.json()) as JoinOk;

    const push = await call("/api/clipboard", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "CF-Connecting-IP": "12.0.0.1",
      },
      body: JSON.stringify({ roomId, ciphertext: "Q1R4", iv: "SVY" }),
    });
    expect(push.status).toBe(200);

    const get = await call(`/api/clipboard/${roomId}`, {
      headers: { Authorization: `Bearer ${token}`, "CF-Connecting-IP": "12.0.0.1" },
    });
    expect(get.status).toBe(200);
  });
});

describe("expiry clears membership", () => {
  it("removes members on sweep so their token stops authorizing", async () => {
    const roomId = "exp-room";
    const joinRes = await join(roomId, 2, "13.0.0.1");
    const { token } = (await joinRes.json()) as JoinOk;

    await env.DB.prepare("UPDATE rooms SET expires_at = ? WHERE room_id = ?")
      .bind(Date.now() - 1, roomId)
      .run();
    await handleScheduled(env);

    expect(await roomCount(roomId)).toBe(0);
    expect(await memberCount(roomId)).toBe(0);

    const push = await call("/api/clipboard", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "CF-Connecting-IP": "13.0.0.1",
      },
      body: JSON.stringify({ roomId, ciphertext: "Q1R4", iv: "SVY" }),
    });
    expect(push.status).toBe(401);
  });
});
