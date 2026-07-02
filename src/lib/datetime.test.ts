import { describe, expect, it } from "vitest";
import { formatDateTime } from "./datetime";

describe("formatDateTime", () => {
  it("formats local time as YYYY-MM-DD HH:mm:SS with zero-padding", () => {
    // Built and read in local time, so the assertion is timezone-independent.
    const ms = new Date(2026, 0, 2, 3, 4, 5).getTime();
    expect(formatDateTime(ms)).toBe("2026-01-02 03:04:05");
  });

  it("pads two-digit fields and handles December / late times", () => {
    const ms = new Date(2025, 11, 31, 23, 59, 9).getTime();
    expect(formatDateTime(ms)).toBe("2025-12-31 23:59:09");
  });
});
