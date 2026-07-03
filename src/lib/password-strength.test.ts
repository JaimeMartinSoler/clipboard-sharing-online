import { describe, expect, it } from "vitest";
import { estimatePassword } from "./password-strength";

describe("estimatePassword", () => {
  it("treats the empty string as no level, no bars", () => {
    expect(estimatePassword("")).toEqual({ level: "none", bars: 0 });
  });

  it("rates 1-3 chars as weak (1 bar)", () => {
    for (const pw of ["a", "ab", "abc"]) {
      expect(estimatePassword(pw)).toEqual({ level: "weak", bars: 1 });
    }
  });

  it("rates 4-7 chars as fair (2 bars)", () => {
    for (const pw of ["abcd", "abcde", "abcdef", "abcdefg"]) {
      expect(estimatePassword(pw)).toEqual({ level: "fair", bars: 2 });
    }
  });

  it("rates 8+ chars as strong (3 bars)", () => {
    for (const pw of ["abcdefgh", "correct horse battery staple"]) {
      expect(estimatePassword(pw)).toEqual({ level: "strong", bars: 3 });
    }
  });

  it("depends only on length, not character classes", () => {
    expect(estimatePassword("aaaaaaaa")).toEqual(estimatePassword("aB3!xY7?"));
  });
});
