/**
 * Format an epoch-ms timestamp as `YYYY-MM-DD HH:mm:SS` in the viewer's local
 * time (issue #7 members table). Pure and DOM-free so it is unit-testable.
 */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** Below this many ms left, the editor's expiry countdown turns red. */
export const EXPIRY_WARN_MS = 60_000;

/**
 * Format a remaining duration as zero-padded `MM:SS` (e.g. `09:05`) for the
 * editor's expiry countdown. Partial seconds are dropped; a non-positive
 * remainder clamps to `00:00`. Minutes are not wrapped into hours — the
 * longest TTL is one hour, which renders as `60:00`.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(Math.floor(total / 60))}:${p(total % 60)}`;
}

/** True once the countdown shows less than a minute (`< 01:00`). */
export function isExpiringSoon(ms: number): boolean {
  return ms < EXPIRY_WARN_MS;
}
