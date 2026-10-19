/**
 * Persisted entry-view UI preferences (localStorage). This remembers *how the
 * user likes the form set up* so a return visit renders the same way — the last
 * password generator, whether the password was shown, whether Advanced Settings
 * was open, and the choices inside it.
 *
 * SECURITY: the password itself is NEVER stored — only the *kind* of generator
 * last used, so we can seed a fresh random one of the same style. Everything
 * here is non-secret UI chrome. Theme is handled separately by `next-themes`,
 * which already persists it to localStorage.
 *
 * Reads are total (SSR-safe, corruption-safe): a missing key, unavailable
 * storage, or malformed JSON all fall back to sane defaults, merged field by
 * field so a partial/legacy blob never throws.
 */
import type { SyncMode } from "./api";

/** Which generator the user last used, so we can reseed the same style. */
export type PasswordKind = "simple" | "safer";

export interface UiPreferences {
  /** Last password generator used ("simple" ⇒ short, "safer" ⇒ long). */
  passwordKind: PasswordKind;
  /** Whether the password field was left revealed. */
  showPassword: boolean;
  /** Whether the Advanced Settings panel was left expanded. */
  advancedOpen: boolean;
  /** Sealed (bounded, seals when full) vs open (unlimited, never seals). */
  sealedRoom: boolean;
  /** Terminal cap for a sealed room (ignored while `sealedRoom` is false). */
  capacity: number;
  /** The sharing mode last chosen for a created room. */
  syncMode: SyncMode;
}

export const DEFAULT_PREFERENCES: UiPreferences = {
  // A long generated password, kept hidden: the common path is "create → share
  // the link/QR → done", so nobody needs to read or retype it.
  passwordKind: "safer",
  showPassword: false,
  advancedOpen: false,
  sealedRoom: true,
  capacity: 2,
  syncMode: "push",
};

/** Namespaced, versioned key so a future schema change can migrate cleanly. */
const STORAGE_KEY = "cso.ui.v1";

const SYNC_MODES: readonly SyncMode[] = ["manual", "push", "typing"];

function isSyncMode(value: unknown): value is SyncMode {
  return typeof value === "string" && SYNC_MODES.includes(value as SyncMode);
}

/**
 * Coerce an unknown parsed blob into a full `UiPreferences`, taking each field
 * only when it is present AND well-typed, and falling back to the default
 * otherwise. This makes both partial writes and hostile/corrupt data harmless.
 */
export function coercePreferences(raw: unknown): UiPreferences {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_PREFERENCES };
  const o = raw as Record<string, unknown>;
  return {
    passwordKind:
      o.passwordKind === "simple" || o.passwordKind === "safer"
        ? o.passwordKind
        : DEFAULT_PREFERENCES.passwordKind,
    showPassword:
      typeof o.showPassword === "boolean"
        ? o.showPassword
        : DEFAULT_PREFERENCES.showPassword,
    advancedOpen:
      typeof o.advancedOpen === "boolean"
        ? o.advancedOpen
        : DEFAULT_PREFERENCES.advancedOpen,
    sealedRoom:
      typeof o.sealedRoom === "boolean"
        ? o.sealedRoom
        : DEFAULT_PREFERENCES.sealedRoom,
    // Clamp to the same 1–6 the creator UI offers; anything else → default.
    capacity:
      typeof o.capacity === "number" &&
      Number.isInteger(o.capacity) &&
      o.capacity >= 1 &&
      o.capacity <= 6
        ? o.capacity
        : DEFAULT_PREFERENCES.capacity,
    syncMode: isSyncMode(o.syncMode)
      ? o.syncMode
      : DEFAULT_PREFERENCES.syncMode,
  };
}

/** Load preferences, always returning a complete object (defaults on any miss). */
export function loadPreferences(): UiPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return { ...DEFAULT_PREFERENCES };
    return coercePreferences(JSON.parse(stored));
  } catch {
    // Storage disabled (private mode), quota, or malformed JSON — use defaults.
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Persist preferences. A no-op (never throws) when storage is unavailable. */
export function savePreferences(prefs: UiPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Best-effort only: a full/blocked store must never break the UI.
  }
}

/**
 * First-visit marker, kept under its own key (not inside `UiPreferences`, which
 * is only written once a preference actually changes). Holds no data beyond
 * "this browser has opened the app before" — it lets a share-link recipient see
 * a one-time explainer of what the site is, and a returning visitor nothing.
 */
const VISITED_KEY = "cso.visited.v1";

/**
 * Whether this browser has opened the app before. Total like `loadPreferences`:
 * only the exact marker counts as a return visit; SSR, blocked storage, or a
 * missing/corrupt value all read as a first visit.
 */
export function hasVisitedBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(VISITED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Record that this browser has opened the app. Never throws. */
export function recordVisit(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VISITED_KEY, "1");
  } catch {
    // Best-effort only, like `savePreferences`.
  }
}
