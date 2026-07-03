import { describe, expect, it } from "vitest";
import { generateSaferPassword, generateSimplePassword } from "./password-gen";

describe("generateSimplePassword", () => {
  it("is 6 chars: 4 uppercase letters then 2 digits", () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateSimplePassword();
      expect(pw).toMatch(/^[A-Z]{4}[0-9]{2}$/);
    }
  });

  it("is not constant across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(generateSimplePassword());
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("generateSaferPassword", () => {
  it("is 16 chars from the expected alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateSaferPassword();
      expect(pw).toHaveLength(16);
      expect(pw).toMatch(/^[A-Za-z0-9!@#$%^&*\-_=+]{16}$/);
    }
  });

  it("is not constant across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(generateSaferPassword());
    expect(seen.size).toBeGreaterThan(1);
  });
});
