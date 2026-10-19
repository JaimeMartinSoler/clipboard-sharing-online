import { describe, expect, it } from "vitest";
import type { SyncMode } from "@/lib/api";
import { isPushDisabled } from "@/lib/push-state";

describe("isPushDisabled", () => {
  const modes: SyncMode[] = ["manual", "push", "typing"];

  it("is always disabled while a request is in flight", () => {
    for (const mode of modes) {
      expect(isPushDisabled(mode, true, true)).toBe(true);
      expect(isPushDisabled(mode, true, false)).toBe(true);
    }
  });

  it("is always enabled when there are unsynced changes", () => {
    for (const mode of modes) {
      expect(isPushDisabled(mode, false, true)).toBe(false);
    }
  });

  it("disables an already-synced copy only in live push mode", () => {
    expect(isPushDisabled("push", false, false)).toBe(true);
  });

  it("keeps manual Push enabled with no changes (re-assert copy / re-send TTL)", () => {
    expect(isPushDisabled("manual", false, false)).toBe(false);
  });

  it("keeps typing-mode Sync now enabled with no changes", () => {
    expect(isPushDisabled("typing", false, false)).toBe(false);
  });
});
