import { describe, expect, it } from "vitest";
import { estimatePassword, isWeakPassword } from "./password-strength";

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

  it("rates ordinary 4–7 char passwords as 'fair' with two bars", () => {
    for (const pw of ["t9kd", "m4xz", "Rp7q", "k3Wm9"]) {
      const r = estimatePassword(pw);
      expect(r.level).toBe("fair");
      expect(r.filledBars).toBe(2);
    }
  });

  it("rates ordinary 8+ char passwords as 'strong' with all three bars", () => {
    for (const pw of ["9xKmQ2vL", "Tr7b4Dz1pR"]) {
      const r = estimatePassword(pw);
      expect(r.level).toBe("strong");
      expect(r.filledBars).toBe(3);
    }
  });

  it("demotes trivially guessable passwords to 'weak' regardless of length", () => {
    for (const pw of [
      "abcd",
      "12345678",
      "0000",
      "1212121212",
      "papapapapapa",
      "qwerty",
      "password123",
    ]) {
      expect(estimatePassword(pw).level).toBe("weak");
    }
  });

  it("always reports 0..3 filled bars", () => {
    for (const pw of ["", "a", "t9kd", "9xKmQ2vL", "x".repeat(200)]) {
      const { filledBars } = estimatePassword(pw);
      expect(filledBars).toBeGreaterThanOrEqual(0);
      expect(filledBars).toBeLessThanOrEqual(3);
    }
  });
});

describe("isWeakPassword", () => {
  it("flags too-short passwords", () => {
    for (const pw of ["", "a", "ab", "abc"]) {
      expect(isWeakPassword(pw)).toBe(true);
    }
  });

  it("flags consecutive-run and low-diversity patterns", () => {
    for (const pw of ["abcd", "12345678", "0000", "1212121212", "papapapa"]) {
      expect(isWeakPassword(pw)).toBe(true);
    }
  });

  it("removes forbidden words recursively before judging the remainder", () => {
    // "1234" is weak, so "key1234" is weak once "key" is stripped.
    expect(isWeakPassword("key1234")).toBe(true);
    // A strong remainder survives even though the input contains "pass".
    expect(isWeakPassword("pass034vg$%&BV")).toBe(false);
    // A password built entirely around a forbidden word is weak.
    expect(isWeakPassword("qwerty")).toBe(true);
    expect(isWeakPassword("hello123")).toBe(true);
  });

  it("accepts a diverse, non-patterned password", () => {
    for (const pw of ["9xKmQ2vL", "Tr7b4Dz1pR", "k3Wm9"]) {
      expect(isWeakPassword(pw)).toBe(false);
    }
  });
});
