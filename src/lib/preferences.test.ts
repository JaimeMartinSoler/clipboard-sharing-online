import { afterEach, describe, expect, it } from "vitest";
import {
  coercePreferences,
  DEFAULT_PREFERENCES,
  hasVisitedBefore,
  loadPreferences,
  recordVisit,
  savePreferences,
  type UiPreferences,
} from "./preferences";

/** Minimal in-memory Storage stand-in so we can exercise load/save under node. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function withWindow(storage: unknown, fn: () => void): void {
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  try {
    fn();
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("coercePreferences", () => {
  it("returns a full default set for non-objects", () => {
    expect(coercePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(coercePreferences("nope")).toEqual(DEFAULT_PREFERENCES);
    expect(coercePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps valid fields and defaults the rest (partial blob)", () => {
    const got = coercePreferences({ showPassword: true, capacity: 5 });
    expect(got.showPassword).toBe(true);
    expect(got.capacity).toBe(5);
    // Untouched fields fall back to defaults.
    expect(got.passwordKind).toBe(DEFAULT_PREFERENCES.passwordKind);
    expect(got.sealedRoom).toBe(DEFAULT_PREFERENCES.sealedRoom);
    expect(got.syncMode).toBe(DEFAULT_PREFERENCES.syncMode);
  });

  it("rejects out-of-range capacity and bad enums", () => {
    expect(coercePreferences({ capacity: 0 }).capacity).toBe(2);
    expect(coercePreferences({ capacity: 7 }).capacity).toBe(2);
    expect(coercePreferences({ capacity: 2.5 }).capacity).toBe(2);
    expect(coercePreferences({ passwordKind: "weird" }).passwordKind).toBe(
      "safer",
    );
    expect(coercePreferences({ syncMode: "bogus" }).syncMode).toBe("push");
  });

  it("accepts every valid sync mode", () => {
    expect(coercePreferences({ syncMode: "manual" }).syncMode).toBe("manual");
    expect(coercePreferences({ syncMode: "typing" }).syncMode).toBe("typing");
  });
});

describe("DEFAULT_PREFERENCES", () => {
  it("seeds a hidden, long (safer) password", () => {
    expect(DEFAULT_PREFERENCES.passwordKind).toBe("safer");
    expect(DEFAULT_PREFERENCES.showPassword).toBe(false);
  });
});

describe("loadPreferences / savePreferences", () => {
  it("round-trips a full preferences object", () => {
    const storage = fakeStorage();
    const prefs: UiPreferences = {
      passwordKind: "safer",
      showPassword: false,
      advancedOpen: true,
      sealedRoom: false,
      capacity: 4,
      syncMode: "typing",
    };
    withWindow(storage, () => {
      savePreferences(prefs);
      expect(loadPreferences()).toEqual(prefs);
    });
  });

  it("never persists a password field", () => {
    const storage = fakeStorage();
    withWindow(storage, () => {
      savePreferences({ ...DEFAULT_PREFERENCES, passwordKind: "simple" });
    });
    const raw = storage.getItem("cso.ui.v1") ?? "";
    expect(raw).not.toContain("password\":");
    // The generator *kind* is fine to store; the secret itself must not appear.
    expect(raw).toContain("passwordKind");
  });

  it("falls back to defaults when nothing is stored", () => {
    withWindow(fakeStorage(), () => {
      expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    });
  });

  it("falls back to defaults on malformed JSON", () => {
    withWindow(fakeStorage({ "cso.ui.v1": "{not json" }), () => {
      expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    });
  });

  it("returns defaults with no window (SSR)", () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("save is a no-op that never throws when storage rejects", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    (globalThis as { window?: unknown }).window = { localStorage: throwing };
    try {
      expect(() => savePreferences(DEFAULT_PREFERENCES)).not.toThrow();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});

describe("hasVisitedBefore / recordVisit", () => {
  it("reads as a first visit until a visit is recorded", () => {
    const storage = fakeStorage();
    withWindow(storage, () => {
      expect(hasVisitedBefore()).toBe(false);
      recordVisit();
      expect(hasVisitedBefore()).toBe(true);
    });
  });

  it("uses its own key, independent of the UI preferences blob", () => {
    const storage = fakeStorage();
    withWindow(storage, () => {
      savePreferences(DEFAULT_PREFERENCES);
      expect(hasVisitedBefore()).toBe(false);
      recordVisit();
    });
    expect(storage.getItem("cso.visited.v1")).toBe("1");
    expect(storage.getItem("cso.ui.v1")).not.toContain("visited");
  });

  it("treats a corrupt marker as a first visit", () => {
    withWindow(fakeStorage({ "cso.visited.v1": "{garbage" }), () => {
      expect(hasVisitedBefore()).toBe(false);
    });
  });

  it("is a first visit with no window (SSR)", () => {
    expect(hasVisitedBefore()).toBe(false);
    expect(() => recordVisit()).not.toThrow();
  });

  it("never throws when storage is blocked", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    withWindow(throwing, () => {
      expect(hasVisitedBefore()).toBe(false);
      expect(() => recordVisit()).not.toThrow();
    });
  });
});
