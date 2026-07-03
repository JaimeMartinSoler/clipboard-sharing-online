/**
 * Trailing debounce with an optional max-wait, used by the `typing` sync mode
 * to auto-push while the user types: quiet for `waitMs` → fire once; never go
 * longer than `maxWaitMs` without firing during a continuous burst (so a
 * non-stop typist still syncs every few seconds instead of never).
 */

export interface DebounceOptions {
  /** Trailing quiet period before firing. */
  waitMs: number;
  /** Upper bound on how long a continuous burst may delay a fire. */
  maxWaitMs?: number;
}

export interface Debounced {
  /** Register a call; fires after `waitMs` of quiet (or at `maxWaitMs`). */
  call: () => void;
  /** Fire now if anything is pending (used by the Push/"Sync now" button). */
  flush: () => void;
  /** Drop anything pending without firing (used on unmount/leave). */
  cancel: () => void;
  /** Whether a fire is currently scheduled. */
  pending: () => boolean;
}

export function createDebounced(
  fn: () => void,
  { waitMs, maxWaitMs }: DebounceOptions,
): Debounced {
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (waitTimer !== null) clearTimeout(waitTimer);
    if (maxTimer !== null) clearTimeout(maxTimer);
    waitTimer = null;
    maxTimer = null;
  };

  const fire = () => {
    clearTimers();
    fn();
  };

  return {
    call() {
      if (waitTimer !== null) clearTimeout(waitTimer);
      waitTimer = setTimeout(fire, waitMs);
      // The max-wait clock starts with the burst and is NOT reset by
      // subsequent calls — that is what bounds a continuous burst.
      if (maxWaitMs !== undefined && maxTimer === null) {
        maxTimer = setTimeout(fire, maxWaitMs);
      }
    },
    flush() {
      if (waitTimer === null && maxTimer === null) return;
      fire();
    },
    cancel: clearTimers,
    pending: () => waitTimer !== null || maxTimer !== null,
  };
}
