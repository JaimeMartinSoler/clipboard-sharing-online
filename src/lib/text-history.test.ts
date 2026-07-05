import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  initHistory,
  MAX_HISTORY,
  record,
  redo,
  undo,
} from "./text-history";

describe("text-history", () => {
  it("starts empty with no undo/redo available", () => {
    const h = initHistory("");
    expect(h.present).toBe("");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("seeds the present value", () => {
    expect(initHistory("hello").present).toBe("hello");
  });

  it("records edits and enables undo", () => {
    const h = record(record(initHistory(""), "a"), "ab");
    expect(h.present).toBe("ab");
    expect(canUndo(h)).toBe(true);
  });

  it("ignores no-op edits (same value)", () => {
    const h1 = record(initHistory(""), "a");
    const h2 = record(h1, "a");
    expect(h2).toBe(h1);
    expect(h2.past).toHaveLength(1);
  });

  it("undo restores the previous value and enables redo", () => {
    const typed = record(record(initHistory(""), "a"), "ab");
    const back = undo(typed);
    expect(back.present).toBe("a");
    expect(canRedo(back)).toBe(true);
  });

  it("redo reapplies an undone value", () => {
    const typed = record(record(initHistory(""), "a"), "ab");
    const forward = redo(undo(typed));
    expect(forward.present).toBe("ab");
    expect(canRedo(forward)).toBe(false);
  });

  it("undo is a no-op at the start of history", () => {
    const h = initHistory("x");
    expect(undo(h)).toBe(h);
  });

  it("redo is a no-op with an empty future", () => {
    const h = record(initHistory(""), "a");
    expect(redo(h)).toBe(h);
  });

  it("recording after an undo clears the redo stack", () => {
    const typed = record(record(initHistory(""), "a"), "ab");
    const back = undo(typed);
    const branched = record(back, "ac");
    expect(branched.present).toBe("ac");
    expect(canRedo(branched)).toBe(false);
  });

  it("walks back through several steps in order", () => {
    let h = initHistory("");
    for (const v of ["a", "ab", "abc"]) h = record(h, v);
    h = undo(h);
    expect(h.present).toBe("ab");
    h = undo(h);
    expect(h.present).toBe("a");
    h = undo(h);
    expect(h.present).toBe("");
    expect(canUndo(h)).toBe(false);
  });

  it("caps the retained history at MAX_HISTORY", () => {
    let h = initHistory("");
    for (let i = 0; i <= MAX_HISTORY + 10; i++) h = record(h, `v${i}`);
    expect(h.past.length).toBeLessThanOrEqual(MAX_HISTORY);
  });
});
