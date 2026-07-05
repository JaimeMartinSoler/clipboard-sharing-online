/**
 * A tiny undo/redo history for the shared text box. Pure and immutable: every
 * operation returns a new `History`, so it can back a React `useState` directly
 * and stays trivially unit-testable. `present` is always the value on screen.
 *
 * `record` collapses no-op edits (same value) and caps the past so a long typing
 * session can't grow the stack without bound. Recording a new value clears the
 * redo (`future`) stack, matching the familiar editor behaviour.
 */
export interface History {
  past: string[];
  present: string;
  future: string[];
}

/** Upper bound on retained undo steps — old entries drop off the front. */
export const MAX_HISTORY = 100;

export function initHistory(present = ""): History {
  return { past: [], present, future: [] };
}

/** Push a new present value; a no-op when unchanged. Clears the redo stack. */
export function record(h: History, next: string): History {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, present: next, future: [] };
}

export function undo(h: History): History {
  const previous = h.past[h.past.length - 1];
  if (previous === undefined) return h;
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  };
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return {
    past: [...h.past, h.present],
    present: next,
    future: rest,
  };
}

export const canUndo = (h: History): boolean => h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;
