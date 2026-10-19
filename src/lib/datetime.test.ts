import { describe, expect, it } from "vitest";
import { formatCountdown, formatDateTime, isExpiringSoon } from "./datetime";

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

describe("formatCountdown", () => {
  it("formats MM:SS with a zero-padded minute under 10", () => {
    expect(formatCountdown(9 * 60_000 + 5_000)).toBe("09:05");
    expect(formatCountdown(59_000)).toBe("00:59");
  });

  it("keeps two-digit minutes and renders the 1-hour TTL as 60:00", () => {
    expect(formatCountdown(10 * 60_000)).toBe("10:00");
    expect(formatCountdown(3_600_000)).toBe("60:00");
  });

  it("drops partial seconds", () => {
    expect(formatCountdown(60_999)).toBe("01:00");
    expect(formatCountdown(999)).toBe("00:00");
  });

  it("clamps zero and negative remainders to 00:00", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5_000)).toBe("00:00");
  });
});

describe("isExpiringSoon", () => {
  it("is true only below one minute", () => {
    expect(isExpiringSoon(60_000)).toBe(false);
    expect(isExpiringSoon(59_999)).toBe(true);
    expect(isExpiringSoon(0)).toBe(true);
    expect(isExpiringSoon(-1)).toBe(true);
  });
});
