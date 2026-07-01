import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimit, handleScheduled } from "../src/index";
import {
  bearer,
  call,
  memberCount,
  resetDb,
  roomCount,
  seedMember,
  seedRoom,
} from "./helpers";

const TOKEN = "valid-member-token";

function pushReq(
  roomId: string,
  ciphertext: string,
  iv: string,
  token = TOKEN,
  ip = "1.1.1.1",
): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...bearer(token, ip),
    },
    body: JSON.stringify({ roomId, ciphertext, iv }),
  };
}

beforeEach(async () => {
  __resetRateLimit();
  await resetDb();
});

describe("POST/GET /api/clipboard round-trip", () => {
  it("stores and returns the encrypted blob for a member of a live room", async () => {
    await seedRoom("room-abc");
    await seedMember("room-abc", TOKEN);

    const push = await call("/api/clipboard", pushReq("room-abc", "Q1R4", "SVY"));
    expect(push.status).toBe(200);
    const pushBody = (await push.json()) as { ok: boolean; expiresAt: number };
    expect(pushBody.ok).toBe(true);
    expect(pushBody.expiresAt).toBeGreaterThan(Date.now());

    const get = await call("/api/clipboard/room-abc", { headers: bearer(TOKEN) });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { ciphertext: string; iv: string };
    expect(body.ciphertext).toBe("Q1R4");
    expect(body.iv).toBe("SVY");
  });
});

describe("no existence oracle (uniform 404 for members)", () => {
  it("404s for a member whose room has no blob yet", async () => {
    await seedRoom("room-empty");
    await seedMember("room-empty", TOKEN);
    const get = await call("/api/clipboard/room-empty", { headers: bearer(TOKEN) });
    expect(get.status).toBe(404);
  });

  it("404s on an expired room and lazily deletes it with its members", async () => {
    await seedRoom("room-old", {
      ciphertext: "Q1R4",
      iv: "SVY",
      expiresAt: Date.now() - 1,
    });
    await seedMember("room-old", TOKEN);

    const get = await call("/api/clipboard/room-old", { headers: bearer(TOKEN) });
    expect(get.status).toBe(404);
    expect(await roomCount("room-old")).toBe(0);
    expect(await memberCount("room-old")).toBe(0);
  });
});

describe("validation & size cap", () => {
  it("400s on a malformed body (before auth)", async () => {
    const res = await call("/api/clipboard", {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(TOKEN, "3.3.3.3") },
      body: JSON.stringify({ roomId: "room-x" }), // missing ciphertext/iv
    });
    expect(res.status).toBe(400);
  });

  it("413s when the ciphertext exceeds the size cap (by DECODED bytes)", async () => {
    await seedRoom("room-big");
    await seedMember("room-big", TOKEN);
    const maxBytes = Number(env.MAX_CIPHERTEXT_BYTES);
    // base64url decodes ~3/4 of its length, so we need > maxBytes*4/3 chars for
    // the decoded payload to exceed the byte cap.
    const tooBig = "A".repeat(Math.ceil(((maxBytes + 1) * 4) / 3) + 4);
    const res = await call(
      "/api/clipboard",
      pushReq("room-big", tooBig, "SVY", TOKEN, "3.3.3.3"),
    );
    expect(res.status).toBe(413);
  });

  it("accepts a payload whose char length exceeds the cap but decodes under it", async () => {
    await seedRoom("room-fit");
    await seedMember("room-fit", TOKEN);
    const maxBytes = Number(env.MAX_CIPHERTEXT_BYTES);
    // More chars than the byte cap, but ~3/4 of them decode → under the cap.
    const chars = maxBytes + 100;
    expect(Math.floor((chars * 3) / 4)).toBeLessThanOrEqual(maxBytes);
    const res = await call(
      "/api/clipboard",
      pushReq("room-fit", "A".repeat(chars), "SVY", TOKEN, "3.3.3.4"),
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/clipboard/:roomId", () => {
  it("clears the blob and is idempotent (always 204 for a member)", async () => {
    await seedRoom("room-del", { ciphertext: "Q1R4", iv: "SVY" });
    await seedMember("room-del", TOKEN);

    const first = await call("/api/clipboard/room-del", {
      method: "DELETE",
      headers: bearer(TOKEN),
    });
    expect(first.status).toBe(204);

    const get = await call("/api/clipboard/room-del", { headers: bearer(TOKEN) });
    expect(get.status).toBe(404); // blob gone, membership remains

    const second = await call("/api/clipboard/room-del", {
      method: "DELETE",
      headers: bearer(TOKEN),
    });
    expect(second.status).toBe(204); // idempotent, no oracle
  });
});

describe("cron sweep", () => {
  it("deletes expired rooms and their members, keeping live rooms", async () => {
    const now = Date.now();
    await seedRoom("room-dead", {
      ciphertext: "Q1R4",
      iv: "SVY",
      expiresAt: now - 1,
    });
    await seedRoom("room-live", { expiresAt: now + 600_000 });
    await seedMember("room-dead", "td");
    await seedMember("room-live", "tl");

    await handleScheduled(env);

    expect(await roomCount("room-dead")).toBe(0);
    expect(await memberCount("room-dead")).toBe(0);
    expect(await roomCount("room-live")).toBe(1);
    expect(await memberCount("room-live")).toBe(1);
  });
});

describe("rate limiting", () => {
  it("429s once a single IP exceeds the window limit", async () => {
    const max = Number(env.RATE_LIMIT_MAX);
    const ip = "9.9.9.9";
    let lastStatus = 0;
    for (let i = 0; i < max + 1; i++) {
      const res = await call("/api/clipboard/whatever", {
        headers: bearer(TOKEN, ip),
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
