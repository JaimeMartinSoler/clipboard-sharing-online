import { describe, expect, it, vi } from "vitest";
import { DESKTOP_POINTER_QUERY, isDesktopPointer } from "./device";

describe("isDesktopPointer", () => {
  it("is true when the primary pointer is fine and can hover (PC)", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    expect(isDesktopPointer({ matchMedia })).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(DESKTOP_POINTER_QUERY);
  });

  it("is false for a coarse/no-hover pointer (phone, tablet)", () => {
    expect(isDesktopPointer({ matchMedia: () => ({ matches: false }) })).toBe(
      false,
    );
  });

  it("defaults to false without matchMedia or when it throws", () => {
    expect(isDesktopPointer(undefined)).toBe(false);
    expect(isDesktopPointer({})).toBe(false);
    expect(
      isDesktopPointer({
        matchMedia: () => {
          throw new Error("nope");
        },
      }),
    ).toBe(false);
  });
});
