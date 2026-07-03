import { env, listDurableObjectIds } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimit } from "../src/index";
import {
  bearer,
  call,
  connectWs,
  nextClose,
  nextMessage,
  noMessageWithin,
  resetDb,
  seedMember,
  seedRoom,
} from "./helpers";

interface UpdateFrame {
  v: number;
  type: string;
  ciphertext: string;
  iv: string;
  expiresAt: number;
}

function push(
  roomId: string,
  token: string,
  ciphertext: string,
  iv = "SVY",
  ip = "8.0.0.1",
): Promise<Response> {
  return call("/api/clipboard", {
    method: "POST",
    headers: { "content-type": "application/json", ...bearer(token, ip) },
    body: JSON.stringify({ roomId, ciphertext, iv }),
  });
}

beforeEach(async () => {
  __resetRateLimit();
  await resetDb();
});

describe("GET /api/rooms/:roomId/ws — handshake", () => {
  it("upgrades a live-room member and echoes the cso.v1 subprotocol", async () => {
    await seedRoom("live", { syncMode: "push" });
    const token = await seedMember("live", "tok-a", "creator");

    const { res, ws } = await connectWs("live", token);
    expect(res.status).toBe(101);
    expect(res.headers.get("Sec-WebSocket-Protocol")).toBe("cso.v1");
    expect(ws).not.toBeNull();
  });

  it("426s a plain GET without an Upgrade header", async () => {
    await seedRoom("live", { syncMode: "push" });
    await seedMember("live", "tok-a");
    const res = await call("/api/rooms/live/ws", {
      headers: { "CF-Connecting-IP": "9.9.9.1" },
    });
    expect(res.status).toBe(426);
  });

  it("401s a missing or unknown token before touching the DO", async () => {
    await seedRoom("live", { syncMode: "push" });
    await seedMember("live", "tok-a");

    const noToken = await call("/api/rooms/live/ws", {
      headers: {
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": "cso.v1",
        "CF-Connecting-IP": "9.9.9.2",
      },
    });
    expect(noToken.status).toBe(401);

    const wrong = await connectWs("live", "not-a-member", "9.9.9.3");
    expect(wrong.res.status).toBe(401);
  });

  it("404s an expired room (uniform with clipboard reads)", async () => {
    await seedRoom("dead", { syncMode: "push", expiresAt: Date.now() - 1 });
    const token = await seedMember("dead", "tok-a");
    const { res } = await connectWs("dead", token);
    expect(res.status).toBe(404);
  });

  it("409s a manual room — sockets are refused by contract", async () => {
    await seedRoom("manual-room", { syncMode: "manual" });
    const token = await seedMember("manual-room", "tok-a");
    const { res } = await connectWs("manual-room", token);
    expect(res.status).toBe(409);
  });
});

describe("push fanout through the room DO", () => {
  it("broadcasts a push to other members but never echoes to the pusher", async () => {
    await seedRoom("fan", { syncMode: "push", capacity: 3 });
    const alice = await seedMember("fan", "tok-alice", "creator");
    const bob = await seedMember("fan", "tok-bob");

    const a = await connectWs("fan", alice, "8.1.0.1");
    const b = await connectWs("fan", bob, "8.1.0.2");
    expect(a.res.status).toBe(101);
    expect(b.res.status).toBe(101);
    if (!a.ws || !b.ws) throw new Error("sockets missing");

    // Attach listeners BEFORE pushing so no frame can slip past.
    const bobFrame = nextMessage(b.ws);
    const aliceSilent = noMessageWithin(a.ws);

    const res = await push("fan", alice, "Q1R4", "SVY", "8.1.0.1");
    expect(res.status).toBe(200);

    const frame = JSON.parse(await bobFrame) as UpdateFrame;
    expect(frame).toMatchObject({ v: 1, type: "update", ciphertext: "Q1R4", iv: "SVY" });
    expect(frame.expiresAt).toBeGreaterThan(Date.now());
    expect(await aliceSilent).toBe(true); // echo suppression

    // Write-through: the blob is durably in D1, not just broadcast.
    const row = await env.DB.prepare(
      "SELECT ciphertext, iv FROM rooms WHERE room_id = ?",
    )
      .bind("fan")
      .first<{ ciphertext: string; iv: string }>();
    expect(row).toMatchObject({ ciphertext: "Q1R4", iv: "SVY" });
  });

  it("404s a push to an expired live room and broadcasts nothing", async () => {
    await seedRoom("stale", { syncMode: "typing" });
    const alice = await seedMember("stale", "tok-alice", "creator");
    const bob = await seedMember("stale", "tok-bob");
    const b = await connectWs("stale", bob, "8.2.0.2");
    if (!b.ws) throw new Error("socket missing");

    await env.DB.prepare("UPDATE rooms SET expires_at = ? WHERE room_id = ?")
      .bind(Date.now() - 1, "stale")
      .run();

    const silent = noMessageWithin(b.ws);
    const res = await push("stale", alice, "Q1R4", "SVY", "8.2.0.1");
    expect(res.status).toBe(404);
    expect(await silent).toBe(true);
  });

  it("keeps manual rooms entirely DO-free", async () => {
    await seedRoom("manual-room", { syncMode: "manual" });
    const token = await seedMember("manual-room", "tok-a");
    const res = await push("manual-room", token, "Q1R4", "SVY", "8.3.0.1");
    expect(res.status).toBe(200);
    // Ids persist across tests in this miniflare instance, so assert that no
    // DO was ever created FOR THIS room rather than that none exist at all.
    const manualId = env.ROOM.idFromName("manual-room");
    const ids = await listDurableObjectIds(env.ROOM);
    expect(ids.some((id) => id.equals(manualId))).toBe(false);
  });
});

describe("socket lifecycle on revoke / nuke", () => {
  it("revoking a joiner closes only their socket with code 4001", async () => {
    await seedRoom("rev", { syncMode: "push", capacity: 3 });
    const creator = await seedMember("rev", "tok-creator", "creator");
    const joiner = await seedMember("rev", "tok-joiner");

    const c = await connectWs("rev", creator, "8.4.0.1");
    const j = await connectWs("rev", joiner, "8.4.0.2");
    if (!c.ws || !j.ws) throw new Error("sockets missing");

    const joinerClosed = nextClose(j.ws);
    const memberRow = await env.DB.prepare(
      "SELECT id FROM members WHERE room_id = ? AND role = 'joiner'",
    )
      .bind("rev")
      .first<{ id: number }>();
    if (!memberRow) throw new Error("joiner row missing");

    const res = await call(`/api/rooms/rev/members/${memberRow.id}`, {
      method: "DELETE",
      headers: bearer(creator, "8.4.0.1"),
    });
    expect(res.status).toBe(200);

    const closed = await joinerClosed;
    expect(closed.code).toBe(4001);
    expect(closed.reason).toBe("revoked");

    // The creator's socket is untouched and still receives broadcasts.
    const frame = nextMessage(c.ws);
    await seedMember("rev", "tok-other"); // another pusher, so no echo skip
    const push2 = await push("rev", "tok-other", "Zm9v", "SVY", "8.4.0.3");
    expect(push2.status).toBe(200);
    expect(JSON.parse(await frame)).toMatchObject({ ciphertext: "Zm9v" });
  });

  it("nuking the room closes every socket with code 4004", async () => {
    await seedRoom("nuke", { syncMode: "push", capacity: 3 });
    const creator = await seedMember("nuke", "tok-creator", "creator");
    const joiner = await seedMember("nuke", "tok-joiner");

    const c = await connectWs("nuke", creator, "8.5.0.1");
    const j = await connectWs("nuke", joiner, "8.5.0.2");
    if (!c.ws || !j.ws) throw new Error("sockets missing");

    const closes = Promise.all([nextClose(c.ws), nextClose(j.ws)]);
    const res = await call("/api/rooms/nuke", {
      method: "DELETE",
      headers: bearer(creator, "8.5.0.1"),
    });
    expect(res.status).toBe(204);

    for (const closed of await closes) {
      expect(closed.code).toBe(4004);
      expect(closed.reason).toBe("room gone");
    }
  });
});

describe("POST /api/rooms — syncMode", () => {
  function create(roomId: string, syncMode: string | undefined, ip: string) {
    const body: Record<string, unknown> = { roomId, mode: "create" };
    if (syncMode !== undefined) body.syncMode = syncMode;
    return call("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify(body),
    });
  }

  it("stores the creator's mode and reports it to a joiner", async () => {
    const created = await create("modes", "typing", "8.6.0.1");
    expect(created.status).toBe(200);
    expect(((await created.json()) as { syncMode: string }).syncMode).toBe(
      "typing",
    );

    const joined = await call("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "8.6.0.2" },
      body: JSON.stringify({ roomId: "modes", mode: "join" }),
    });
    expect(joined.status).toBe(200);
    expect(((await joined.json()) as { syncMode: string }).syncMode).toBe(
      "typing",
    );
  });

  it("defaults to manual when omitted (legacy clients)", async () => {
    const res = await create("legacy", undefined, "8.6.0.3");
    expect(((await res.json()) as { syncMode: string }).syncMode).toBe("manual");
  });

  it("400s an unknown syncMode", async () => {
    expect((await create("bad", "telepathy", "8.6.0.4")).status).toBe(400);
  });
});
