/**
 * Coarse device-class detection for UI defaults. Pure and DOM-free (it takes
 * the slice of `window` it needs), total (never throws), and conservative: any
 * doubt answers "not a desktop", so phone-first defaults win.
 */

/** The slice of `window` we need to read pointer/hover media features. */
export interface DeviceEnv {
  matchMedia?: (query: string) => { matches: boolean };
}

/**
 * A mouse/trackpad-driven screen — a PC or laptop — as opposed to a phone or
 * tablet. Reads the *primary* input's capabilities rather than the screen
 * width or user agent, so a narrow desktop window still counts as a PC and a
 * touchscreen laptop (whose primary pointer is still the trackpad) does too.
 */
export const DESKTOP_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export function isDesktopPointer(env: DeviceEnv | undefined): boolean {
  if (!env?.matchMedia) return false;
  try {
    return env.matchMedia(DESKTOP_POINTER_QUERY).matches;
  } catch {
    return false;
  }
}
