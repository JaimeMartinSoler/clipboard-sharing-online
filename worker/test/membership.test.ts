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
  role: "creator" | "joiner";
}

function post(
  body: Record<string, unknown>,
  ip: string,
): Promise<Response> {
  return call("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

function create(
  roomId: string,
  capacity: number | undefined,
  ip: string,
): Promise<Response> {
  const body: Record<string, unknown> = { roomId, mode: "create" };
  if (capacity !== undefined) body.capacity = capacity;
  return post(body, ip);
}

function join(roomId: string, ip: string): Promise<Response> {
  return post({ roomId, mode: "join" }, ip);
}

beforeEach(async () => {
  __resetRateLimit();
  await resetDb();
});

describe("POST /api/rooms — create/join roles, seal, capacity", () => {
  it("create makes the caller the creator and reports slot/seal state", async () => {
    const res = await create("room-1", 2, "10.0.0.1");
    expect(res.status).toBe(200);
    const a = (await res.json()) as JoinOk;
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.joined).toBe(1);
    expect(a.capacity).toBe(2);
    expect(a.sealed).toBe(false);
    expect(a.role).toBe("creator");
  });

  it("join fills the room, seals at capacity, and 409s once sealed", async () => {
    await create("room-1", 2, "10.0.0.1");

    const second = await join("room-1", "10.0.0.2");
    expect(second.status).toBe(200);
    const b = (await second.json()) as JoinOk;
    expect(b.joined).toBe(2);
    expect(b.sealed).toBe(true);
    expect(b.role).toBe("joiner");

    const third = await join("room-1", "10.0.0.3");
    expect(third.status).toBe(409); // sealed
  });

  it("join on a non-existent room 404s (join never creates)", async () => {
    const res = await join("ghost-room", "10.0.9.9");
    expect(res.status).toBe(404);
    expect(await roomCount("ghost-room")).toBe(0);
  });

  it("create twice on the same room 409s (already exists)", async () => {
    await create("dup", 3, "10.0.3.1");
    const again = await create("dup", 3, "10.0.3.2");
    expect(again.status).toBe(409);
    const body = (await again.json()) as { exists?: boolean };
    expect(body.exists).toBe(true);
    // Only the original creator got a slot.
    expect(await memberCount("dup")).toBe(1);
  });

  it("a capacity-1 room seals on creation", async () => {
    const res = await create("solo", 1, "10.0.4.1");
    const body = (await res.json()) as JoinOk;
    expect(body.sealed).toBe(true);
    expect((await join("solo", "10.0.4.2")).status).toBe(409);
  });

  it("defaults capacity to 2 when omitted on create", async () => {
    const res = await create("room-default", undefined, "10.0.1.1");
    const body = (await res.json()) as JoinOk;
    expect(body.capacity).toBe(2);
  });

  it("400s on bad capacity and bad mode", async () => {
    expect((await create("rc0", 0, "10.0.2.1")).status).toBe(400);
    expect((await create("rc7", 7, "10.0.2.2")).status).toBe(400);
    expect((await create("rc11", 11, "10.0.2.6")).status).toBe(400);
    expect((await create("rcf", 2.5, "10.0.2.3")).status).toBe(400);
    expect((await create("rc6", 6, "10.0.2.4")).status).toBe(200); // 6 is the max
    const badMode = await post(
      { roomId: "rcm", mode: "nope" },
      "10.0.2.5",
    );
    expect(badMode.status).toBe(400);
  });

  it("never over-seals past capacity under concurrent joins", async () => {
    const roomId = "race-room";
    const capacity = 3;
    await create(roomId, capacity, "10.1.0.0");

    const attempts = 8;
    const responses = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        join(roomId, `10.1.0.${i + 1}`),
      ),
    );
    const statuses = responses.map((r) => r.status);
    const granted = statuses.filter((s) => s === 200).length;
    const rejected = statuses.filter((s) => s === 409).length;

    // Creator already holds slot 1, so only 2 more joins can win.
    expect(granted).toBe(capacity - 1);
    expect(rejected).toBe(attempts - (capacity - 1));
    expect(await memberCount(roomId)).toBe(capacity);

    const grantedBodies = await Promise.all(
      responses
        .filter((r) => r.status === 200)
        .map((r) => r.json() as Promise<JoinOk>),
    );
    const slots = grantedBodies.map((b) => b.joined).sort((a, b) => a - b);
    expect(slots).toEqual([2, 3]);
    expect(grantedBodies.filter((b) => b.sealed)).toHaveLength(1); // only slot 3
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

  it("authorizes a token from a real create end-to-end (push + pull)", async () => {
    const roomId = "join-e2e";
    const joinRes = await create(roomId, 2, "12.0.0.1");
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
    const joinRes = await create(roomId, 2, "13.0.0.1");
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

  it("reusing a password after expiry yields a fresh, unsealed room", async () => {
    const roomId = "reuse-room";
    await create(roomId, 2, "14.0.0.1");
    await join(roomId, "14.0.0.2"); // now sealed

    await env.DB.prepare("UPDATE rooms SET expires_at = ? WHERE room_id = ?")
      .bind(Date.now() - 1, roomId)
      .run();

    // A fresh create after TTL succeeds (the expired shell is dropped) and is
    // unsealed again.
    const res = await create(roomId, 2, "14.0.0.3");
    expect(res.status).toBe(200);
    const body = (await res.json()) as JoinOk;
    expect(body.sealed).toBe(false);
    expect(body.role).toBe("creator");
    expect(await memberCount(roomId)).toBe(1);
  });
});
