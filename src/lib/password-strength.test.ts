import { describe, expect, it } from "vitest";
import { estimatePassword } from "./password-strength";

describe("estimatePassword", () => {
  it("treats the empty string as the weakest", () => {
    const r = estimatePassword("");
    expect(r.score).toBe(0);
    expect(r.bits).toBe(0);
  });

  it("rates a short single-class password as weak", () => {
    expect(estimatePassword("aaaa").score).toBeLessThanOrEqual(1);
    expect(estimatePassword("password").score).toBeLessThanOrEqual(1);
  });

  it("rates a long multi-word passphrase as very strong", () => {
    const r = estimatePassword("correct horse battery staple 42");
    expect(r.score).toBe(4);
    expect(r.bits).toBeGreaterThanOrEqual(80);
  });

  it("rewards length: more characters never lowers the entropy estimate", () => {
    const short = estimatePassword("Tr0ub4d");
    const long = estimatePassword("Tr0ub4dour-and-more-words-here");
    expect(long.bits).toBeGreaterThan(short.bits);
  });

  it("rewards a larger character pool at equal length", () => {
    const lower = estimatePassword("abcdefgh");
    const mixed = estimatePassword("aB3!efgh");
    expect(mixed.bits).toBeGreaterThan(lower.bits);
  });

  it("always returns a score within 0..4", () => {
    for (const pw of ["", "a", "abc123", "Aa1!Aa1!Aa1!", "x".repeat(200)]) {
      const { score } = estimatePassword(pw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});
