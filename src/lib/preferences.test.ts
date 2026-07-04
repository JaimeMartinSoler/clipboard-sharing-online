import { afterEach, describe, expect, it } from "vitest";
import {
  coercePreferences,
  DEFAULT_PREFERENCES,
  loadPreferences,
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
    const got = coercePreferences({ showPassword: false, capacity: 5 });
    expect(got.showPassword).toBe(false);
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
      "simple",
    );
    expect(coercePreferences({ syncMode: "bogus" }).syncMode).toBe("push");
  });

  it("accepts every valid sync mode", () => {
    expect(coercePreferences({ syncMode: "manual" }).syncMode).toBe("manual");
    expect(coercePreferences({ syncMode: "typing" }).syncMode).toBe("typing");
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
      savePreferences({ ...DEFAULT_PREFERENCES, passwordKind: "safer" });
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
