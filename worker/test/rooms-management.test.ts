import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimit } from "../src/index";
import {
  call,
  memberCount,
  memberId,
  resetDb,
  roomCount,
  roomSealed,
  seedMember,
  seedRoom,
} from "./helpers";

interface MembersOk {
  members: { id: number; role: "creator" | "joiner"; joinedAt: number }[];
}

function auth(token: string, ip = "20.0.0.1"): HeadersInit {
  return { Authorization: `Bearer ${token}`, "CF-Connecting-IP": ip };
}

beforeEach(async () => {
  __resetRateLimit();
  await resetDb();
});

/** A sealed 2-terminal room with a known creator + joiner token. */
async function seedRoomWithMembers(roomId: string): Promise<{
  creator: string;
  joiner: string;
}> {
  await seedRoom(roomId, { capacity: 2, sealed: 1 });
  const creator = await seedMember(roomId, `${roomId}-creator`, "creator");
  const joiner = await seedMember(roomId, `${roomId}-joiner`, "joiner");
  return { creator, joiner };
}

describe("GET /api/rooms/:roomId/members — creator only", () => {
  it("returns members (id, role, joinedAt) to the creator", async () => {
    const { creator } = await seedRoomWithMembers("m1");
    const res = await call("/api/rooms/m1/members", { headers: auth(creator) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MembersOk;
    expect(body.members).toHaveLength(2);
    expect(body.members.map((m) => m.role).sort()).toEqual([
      "creator",
      "joiner",
    ]);
    // No PII: the payload carries only id, role, joinedAt.
    for (const m of body.members) {
      expect(Object.keys(m).sort()).toEqual(["id", "joinedAt", "role"]);
    }
  });

  it("403s for a joiner", async () => {
    const { joiner } = await seedRoomWithMembers("m2");
    const res = await call("/api/rooms/m2/members", { headers: auth(joiner) });
    expect(res.status).toBe(403);
  });

  it("401s for a non-member / missing token", async () => {
    await seedRoomWithMembers("m3");
    expect(
      (await call("/api/rooms/m3/members", { headers: auth("nope") })).status,
    ).toBe(401);
    expect(
      (
        await call("/api/rooms/m3/members", {
          headers: { "CF-Connecting-IP": "20.0.0.9" },
        })
      ).status,
    ).toBe(401);
  });
});

describe("DELETE /api/rooms/:roomId/members/:id — revoke a joiner", () => {
  it("removes the joiner without reopening the sealed slot", async () => {
    const roomId = "r-revoke";
    const { creator, joiner } = await seedRoomWithMembers(roomId); // sealed = 1
    const joinerId = await memberId(roomId, joiner);
    expect(await roomSealed(roomId)).toBe(1);

    const res = await call(`/api/rooms/${roomId}/members/${joinerId}`, {
      method: "DELETE",
      headers: auth(creator),
    });
    expect(res.status).toBe(200);
    expect(await memberCount(roomId)).toBe(1); // creator remains

    // The revoked joiner's token no longer authorizes clipboard ops.
    const pull = await call(`/api/clipboard/${roomId}`, {
      headers: auth(joiner),
    });
    expect(pull.status).toBe(401);

    // Seal flag is untouched — the freed slot does not reopen.
    expect(await roomSealed(roomId)).toBe(1);
  });

  it("403s for a joiner trying to remove another member", async () => {
    const roomId = "r-revoke-2";
    const { creator, joiner } = await seedRoomWithMembers(roomId);
    const creatorId = await memberId(roomId, creator);
    const res = await call(`/api/rooms/${roomId}/members/${creatorId}`, {
      method: "DELETE",
      headers: auth(joiner),
    });
    expect(res.status).toBe(403);
    expect(await memberCount(roomId)).toBe(2);
  });

  it("400s when the creator tries to remove themselves", async () => {
    const roomId = "r-self";
    const { creator } = await seedRoomWithMembers(roomId);
    const creatorId = await memberId(roomId, creator);
    const res = await call(`/api/rooms/${roomId}/members/${creatorId}`, {
      method: "DELETE",
      headers: auth(creator),
    });
    expect(res.status).toBe(400);
    expect(await memberCount(roomId)).toBe(2);
  });

  it("404s for an unknown member id", async () => {
    const roomId = "r-unknown";
    const { creator } = await seedRoomWithMembers(roomId);
    const res = await call(`/api/rooms/${roomId}/members/999999`, {
      method: "DELETE",
      headers: auth(creator),
    });
    expect(res.status).toBe(404);
  });

  it("400s on a non-integer member id", async () => {
    const roomId = "r-badid";
    const { creator } = await seedRoomWithMembers(roomId);
    const res = await call(`/api/rooms/${roomId}/members/abc`, {
      method: "DELETE",
      headers: auth(creator),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/rooms/:roomId — nuke the room", () => {
  it("deletes room + members for the creator", async () => {
    const roomId = "nuke-me";
    const { creator } = await seedRoomWithMembers(roomId);
    const res = await call(`/api/rooms/${roomId}`, {
      method: "DELETE",
      headers: auth(creator),
    });
    expect(res.status).toBe(204);
    expect(await roomCount(roomId)).toBe(0);
    expect(await memberCount(roomId)).toBe(0);
  });

  it("403s for a joiner", async () => {
    const roomId = "nuke-guard";
    const { joiner } = await seedRoomWithMembers(roomId);
    const res = await call(`/api/rooms/${roomId}`, {
      method: "DELETE",
      headers: auth(joiner),
    });
    expect(res.status).toBe(403);
    expect(await roomCount(roomId)).toBe(1);
  });

  it("401s for a non-member", async () => {
    const roomId = "nuke-401";
    await seedRoomWithMembers(roomId);
    const res = await call(`/api/rooms/${roomId}`, {
      method: "DELETE",
      headers: auth("stranger"),
    });
    expect(res.status).toBe(401);
    expect(await roomCount(roomId)).toBe(1);
  });
});
