/**
 * Fire-and-forget micro-animations via the Web Animations API. Each call starts
 * a fresh animation, so rapid repeat triggers (e.g. mashing a button) restart
 * cleanly without class-toggling or reflow tricks. Purely cosmetic: it no-ops
 * without a target, without WAAPI support (old browsers, the test DOM), or when
 * the user prefers reduced motion — and it never throws.
 */

/** The slice of `Element` we need, so the helper is testable without a DOM. */
export interface Animatable {
  animate?: (
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => unknown;
}

/** The slice of `window` we need to read the reduced-motion preference. */
export interface MotionEnv {
  matchMedia?: (query: string) => { matches: boolean };
}

export function prefersReducedMotion(env: MotionEnv | undefined): boolean {
  if (!env?.matchMedia) return false;
  try {
    return env.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Plays `keyframes` on `el`; returns whether an animation was started. */
export function playAnimation(
  el: Animatable | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  env: MotionEnv | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (!el || typeof el.animate !== "function") return false;
  if (prefersReducedMotion(env)) return false;
  try {
    el.animate(keyframes, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * A soft "beat" for a button that just did something invisible: a quick press
 * and rebound, with a tint of the hover color at the peak. Unlisted end states
 * fall back to the element's own styles (implicit keyframes), so it settles
 * exactly where it started in either theme.
 */
export const BUTTON_BEAT: [Keyframe[], KeyframeAnimationOptions] = [
  [
    { offset: 0.3, transform: "scale(0.95)", backgroundColor: "hsl(var(--accent))" },
    { offset: 0.65, transform: "scale(1.03)" },
  ],
  { duration: 380, easing: "ease-out" },
];

/**
 * The matching beat for the password field: its characters (masked dots too)
 * breathe apart and settle while a faint ring pulses, so a fresh password
 * registers even when it's hidden.
 */
export const FIELD_BEAT: [Keyframe[], KeyframeAnimationOptions] = [
  [
    {
      offset: 0.35,
      letterSpacing: "0.18em",
      boxShadow: "0 0 0 3px hsl(var(--ring) / 0.2)",
    },
  ],
  { duration: 480, easing: "ease-out" },
];

/**
 * A double "pump" that draws the creator's eye to the Share options on entering
 * a room they just created: BUTTON_BEAT's press-and-rebound at 3× the amplitude
 * (it must be noticed, not just felt), played twice after a short delay so it
 * lands once the room view has painted. Transforms never reflow the layout; at
 * the peak, neighbouring buttons briefly overlap a few px across their `gap-2`.
 * No background tint — the share buttons are primary-filled, where an accent
 * flash would wash out their label for a frame.
 */
export const ATTENTION_BEAT: [Keyframe[], KeyframeAnimationOptions] = [
  [
    { offset: 0.3, transform: "scale(0.85)" },
    { offset: 0.65, transform: "scale(1.09)" },
  ],
  { duration: 380, easing: "ease-out", iterations: 2, delay: 300 },
];
