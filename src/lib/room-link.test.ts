import { describe, expect, it } from "vitest";
import {
  buildShareUrl,
  decodePasswordHash,
  encodePasswordHash,
} from "./room-link";

describe("room-link fragment encoding", () => {
  it("round-trips a password through the fragment", () => {
    const pw = "correct horse battery staple";
    const hash = encodePasswordHash(pw);
    expect(hash.startsWith("#p=")).toBe(true);
    expect(decodePasswordHash(hash)).toBe(pw);
  });

  it("round-trips unicode and symbols", () => {
    const pw = "pä$$wörd 🔒 — 秘密 & more";
    expect(decodePasswordHash(encodePasswordHash(pw))).toBe(pw);
  });

  it("accepts a fragment with or without the leading #", () => {
    const hash = encodePasswordHash("hunter2");
    expect(decodePasswordHash(hash)).toBe("hunter2");
    expect(decodePasswordHash(hash.slice(1))).toBe("hunter2");
  });

  it("finds p= among other fragment params", () => {
    const encoded = encodePasswordHash("secret").slice(3); // just the value
    expect(decodePasswordHash(`#a=1&p=${encoded}&b=2`)).toBe("secret");
  });

  it("returns null for absent/empty/malformed fragments", () => {
    expect(decodePasswordHash("")).toBeNull();
    expect(decodePasswordHash("#")).toBeNull();
    expect(decodePasswordHash("#p=")).toBeNull();
    expect(decodePasswordHash("#q=abc")).toBeNull();
    expect(decodePasswordHash("#nothing")).toBeNull();
  });

  it("does not encode the password in a path- or query-visible way", () => {
    const hash = encodePasswordHash("topsecret");
    // No raw password, and it lives strictly after the # (never sent to server).
    expect(hash).not.toContain("topsecret");
    expect(hash.indexOf("#")).toBe(0);
  });

  it("builds an absolute share URL with the fragment", () => {
    const res = buildShareUrl("https://clipboard-sharing-online.com", "pw");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBe(
        `https://clipboard-sharing-online.com/${encodePasswordHash("pw")}`,
      );
      expect(decodePasswordHash(new URL(res.value).hash)).toBe("pw");
    }
  });

  it("normalises a trailing slash in the origin", () => {
    const res = buildShareUrl("https://example.com/", "pw");
    expect(res.ok && res.value).toBe(
      `https://example.com/${encodePasswordHash("pw")}`,
    );
  });

  it("errors on an empty password", () => {
    expect(buildShareUrl("https://example.com", "").ok).toBe(false);
  });
});
