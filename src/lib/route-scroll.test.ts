import { describe, expect, it, vi } from "vitest";
import { resetRouteScroll, type ScrollTarget } from "./route-scroll";

function target(): ScrollTarget & { scrollTo: ReturnType<typeof vi.fn> } {
  return { scrollTo: vi.fn() };
}

describe("resetRouteScroll", () => {
  it("scrolls every target to the top when there is no fragment", () => {
    const main = target();
    const win = target();
    expect(resetRouteScroll("", [main, win])).toBe(true);
    expect(main.scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(win.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("treats a bare '#' as no fragment", () => {
    const main = target();
    expect(resetRouteScroll("#", [main])).toBe(true);
    expect(main.scrollTo).toHaveBeenCalledOnce();
  });

  it("leaves a fragment link where Next scrolled it", () => {
    const main = target();
    const win = target();
    expect(resetRouteScroll("#fixed-salt", [main, win])).toBe(false);
    expect(main.scrollTo).not.toHaveBeenCalled();
    expect(win.scrollTo).not.toHaveBeenCalled();
  });

  it("skips missing targets (e.g. no <main> yet)", () => {
    const win = target();
    expect(resetRouteScroll("", [null, undefined, win])).toBe(true);
    expect(win.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});
