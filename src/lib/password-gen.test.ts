import { describe, expect, it } from "vitest";
import {
  generateSaferPassword,
  generateSimplePassword,
} from "./password-gen";

describe("generateSimplePassword", () => {
  it("returns 6 chars: 4 uppercase letters then 2 digits", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateSimplePassword();
      expect(pw).toHaveLength(6);
      expect(pw).toMatch(/^[A-Z]{4}[0-9]{2}$/);
    }
  });

  it("never repeats a letter or a digit", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateSimplePassword();
      const letters = pw.slice(0, 4).split("");
      const digits = pw.slice(4).split("");
      expect(new Set(letters).size).toBe(4);
      expect(new Set(digits).size).toBe(2);
    }
  });

  it("varies between calls (not a constant)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateSimplePassword());
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("generateSaferPassword", () => {
  it("returns 16 chars", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSaferPassword()).toHaveLength(16);
    }
  });

  it("includes at least one of each character class", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateSaferPassword();
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("varies between calls (not a constant)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateSaferPassword());
    expect(seen.size).toBeGreaterThan(1);
  });
});
