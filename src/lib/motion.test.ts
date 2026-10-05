import { describe, expect, it, vi } from "vitest";
import {
  ATTENTION_BEAT,
  BUTTON_BEAT,
  FIELD_BEAT,
  playAnimation,
  prefersReducedMotion,
} from "./motion";

const noMotionPref = { matchMedia: () => ({ matches: false }) };
const reducedMotion = { matchMedia: () => ({ matches: true }) };

describe("prefersReducedMotion", () => {
  it("reads the media query", () => {
    expect(prefersReducedMotion(reducedMotion)).toBe(true);
    expect(prefersReducedMotion(noMotionPref)).toBe(false);
  });

  it("defaults to false without matchMedia or when it throws", () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
    expect(
      prefersReducedMotion({
        matchMedia: () => {
          throw new Error("nope");
        },
      }),
    ).toBe(false);
  });
});

describe("playAnimation", () => {
  it("starts the animation with the given keyframes", () => {
    const animate = vi.fn();
    expect(playAnimation({ animate }, ...BUTTON_BEAT, noMotionPref)).toBe(true);
    expect(animate).toHaveBeenCalledWith(BUTTON_BEAT[0], BUTTON_BEAT[1]);
  });

  it("restarts on every call", () => {
    const animate = vi.fn();
    playAnimation({ animate }, ...FIELD_BEAT, noMotionPref);
    playAnimation({ animate }, ...FIELD_BEAT, noMotionPref);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("no-ops without a target or WAAPI support", () => {
    expect(playAnimation(null, ...BUTTON_BEAT, noMotionPref)).toBe(false);
    expect(playAnimation(undefined, ...BUTTON_BEAT, noMotionPref)).toBe(false);
    expect(playAnimation({}, ...BUTTON_BEAT, noMotionPref)).toBe(false);
  });

  it("respects prefers-reduced-motion", () => {
    const animate = vi.fn();
    expect(playAnimation({ animate }, ...BUTTON_BEAT, reducedMotion)).toBe(false);
    expect(animate).not.toHaveBeenCalled();
  });

  it("never throws when the animation fails to start", () => {
    const animate = vi.fn(() => {
      throw new Error("bad keyframe");
    });
    expect(playAnimation({ animate }, ...BUTTON_BEAT, noMotionPref)).toBe(false);
  });
});

/** The deviation from rest of each keyframe's `scale(x)`, e.g. 0.95 → -0.05. */
function scaleDeltas(keyframes: Keyframe[]): number[] {
  return keyframes.map((k) => {
    const m = /^scale\(([\d.]+)\)$/.exec(String(k.transform));
    return Number(m?.[1]) - 1;
  });
}

describe("ATTENTION_BEAT", () => {
  it("is BUTTON_BEAT's pump at 3× amplitude, played twice, untinted", () => {
    const [keyframes, options] = ATTENTION_BEAT;
    expect(options.iterations).toBe(2);
    expect(options.duration).toBe(BUTTON_BEAT[1].duration);
    expect(keyframes.map((k) => k.offset)).toEqual(
      BUTTON_BEAT[0].map((k) => k.offset),
    );
    const base = scaleDeltas(BUTTON_BEAT[0]);
    scaleDeltas(keyframes).forEach((delta, i) => {
      expect(delta).toBeCloseTo(3 * (base[i] ?? Number.NaN), 6);
    });
    expect(keyframes.some((k) => "backgroundColor" in k)).toBe(false);
  });
});
