/**
 * Result type for pure logic (crypto, API client).
 *
 * Pure functions return a Result instead of throwing on user-input or runtime
 * errors, so the UI can surface the message inline (see CLAUDE.md conventions).
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(error: string): Result<T> {
  return { ok: false, error };
}
