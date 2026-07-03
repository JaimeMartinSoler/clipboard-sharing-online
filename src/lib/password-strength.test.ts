import { describe, expect, it } from "vitest";
import { estimatePassword } from "./password-strength";

describe("estimatePassword", () => {
  it("treats the empty string as 'none' with no filled bars", () => {
    const r = estimatePassword("");
    expect(r.level).toBe("none");
    expect(r.filledBars).toBe(0);
  });

  it("rates 1–3 chars as 'weak' with one bar", () => {
    for (const pw of ["a", "ab", "abc"]) {
      const r = estimatePassword(pw);
      expect(r.level).toBe("weak");
      expect(r.filledBars).toBe(1);
    }
  });

  it("rates 4–7 chars as 'fair' with two bars", () => {
    for (const pw of ["abcd", "abcde", "abcdef", "abcdefg"]) {
      const r = estimatePassword(pw);
      expect(r.level).toBe("fair");
      expect(r.filledBars).toBe(2);
    }
  });

  it("rates 8+ chars as 'strong' with all three bars", () => {
    for (const pw of ["abcdefgh", "a".repeat(20)]) {
      const r = estimatePassword(pw);
      expect(r.level).toBe("strong");
      expect(r.filledBars).toBe(3);
    }
  });

  it("depends only on length, not character classes", () => {
    expect(estimatePassword("aaaa")).toEqual(estimatePassword("aB3!"));
  });

  it("always reports 0..3 filled bars", () => {
    for (const pw of ["", "a", "abcd", "abcdefgh", "x".repeat(200)]) {
      const { filledBars } = estimatePassword(pw);
      expect(filledBars).toBeGreaterThanOrEqual(0);
      expect(filledBars).toBeLessThanOrEqual(3);
    }
  });
});
