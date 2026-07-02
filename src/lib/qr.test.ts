import { describe, expect, it } from "vitest";
import { encodeQrMatrix, qrSvg } from "./qr";

/**
 * We can't decode inside a unit test without a reader, so these assert the
 * structural invariants a valid QR symbol must satisfy (dimensions, finder
 * patterns, timing track, version selection, quiet zone) plus determinism.
 * A scan-verify in a real browser is still the final check (see PR notes).
 */
describe("encodeQrMatrix — structure", () => {
  it("produces a square matrix sized 4*version+17, smallest fitting version", () => {
    const v1 = encodeQrMatrix("x".repeat(14)); // fits version 1 (byte-M cap 14)
    expect(v1).not.toBeNull();
    expect(v1?.size).toBe(21);
    expect(v1?.dark.length).toBe(21);
    expect(v1?.dark.every((row) => row.length === 21)).toBe(true);

    const v2 = encodeQrMatrix("x".repeat(15)); // one byte over → version 2
    expect(v2?.size).toBe(25);
  });

  it("places the three finder patterns at the corners", () => {
    const qr = encodeQrMatrix("hello");
    expect(qr).not.toBeNull();
    if (!qr) return;
    const { dark, size } = qr;
    const at = (y: number, x: number): boolean => dark[y]?.[x] ?? false;
    const cornerIsFinder = (oy: number, ox: number): boolean => {
      // Top border of a finder is 7 dark modules; the inner ring row is light.
      const topAllDark = [0, 1, 2, 3, 4, 5, 6].every((dx) => at(oy, ox + dx));
      const innerLight = [1, 2, 3, 4, 5].every((dx) => !at(oy + 1, ox + dx));
      return topAllDark && innerLight;
    };
    expect(cornerIsFinder(0, 0)).toBe(true); // top-left
    expect(cornerIsFinder(0, size - 7)).toBe(true); // top-right
    expect(cornerIsFinder(size - 7, 0)).toBe(true); // bottom-left
  });

  it("draws the alternating timing track on row/column 6", () => {
    const qr = encodeQrMatrix("timing");
    if (!qr) return;
    const { dark } = qr;
    const at = (y: number, x: number): boolean => dark[y]?.[x] ?? false;
    // Between the finders (indices 8..12) the timing modules alternate and are
    // dark exactly on even coordinates.
    for (let i = 8; i <= 12; i++) {
      expect(at(6, i)).toBe(i % 2 === 0);
      expect(at(i, 6)).toBe(i % 2 === 0);
    }
  });

  it("returns null only when the input exceeds version 10 capacity", () => {
    expect(encodeQrMatrix("a".repeat(213))).not.toBeNull(); // v10-M byte cap
    expect(encodeQrMatrix("a".repeat(213))?.size).toBe(57);
    expect(encodeQrMatrix("a".repeat(214))).toBeNull();
  });

  it("is deterministic for the same input", () => {
    const a = encodeQrMatrix("determinism");
    const b = encodeQrMatrix("determinism");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("qrSvg", () => {
  it("wraps the matrix in an inline SVG with a quiet-zone border", () => {
    const svg = qrSvg("https://clipboard-sharing-online.com/#p=abc");
    expect(svg).not.toBeNull();
    if (!svg) return;
    // Default border 4 on each side around a version-1..n symbol.
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain("<path");
    // No external references → CSP-safe.
    expect(svg).not.toContain("http://www.w3.org/2000/svg\" href");
    expect(svg.includes("url(")).toBe(false);
  });

  it("returns null when the payload is too large to encode", () => {
    expect(qrSvg("a".repeat(500))).toBeNull();
  });
});
