import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebounced } from "./debounce";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebounced", () => {
  it("fires once after the trailing quiet period", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, { waitMs: 1000 });

    d.call();
    d.call();
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.pending()).toBe(false);
  });

  it("resets the quiet period on every call", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, { waitMs: 1000 });

    d.call();
    vi.advanceTimersByTime(900);
    d.call();
    vi.advanceTimersByTime(900);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("caps a continuous burst at maxWaitMs", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, { waitMs: 1000, maxWaitMs: 3000 });

    // Keep "typing" every 500 ms — the trailing timer never gets to fire.
    for (let elapsed = 0; elapsed < 3000; elapsed += 500) {
      d.call();
      vi.advanceTimersByTime(500);
    }
    expect(fn).toHaveBeenCalledTimes(1); // the max-wait fire at 3000 ms
  });

  it("starts a fresh max-wait clock for the next burst", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, { waitMs: 1000, maxWaitMs: 3000 });

    d.call();
    vi.advanceTimersByTime(1000); // trailing fire
    expect(fn).toHaveBeenCalledTimes(1);

    d.call();
    vi.advanceTimersByTime(1000); // trailing fire again, not blocked by old max
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("flush fires immediately when pending and is a no-op otherwise", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, { waitMs: 1000 });

    d.flush();
    expect(fn).not.toHaveBeenCalled();

    d.call();
    expect(d.pending()).toBe(true);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.pending()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1); // no double fire
  });

  it("cancel drops the pending fire silently", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, { waitMs: 1000, maxWaitMs: 3000 });

    d.call();
    d.cancel();
    expect(d.pending()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});
