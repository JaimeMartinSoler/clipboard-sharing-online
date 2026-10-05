import type { SyncMode } from "@/lib/api";

/**
 * Whether the Push button should be disabled. Beyond an in-flight request, it
 * disables only in the live `push` mode while the text equals what was last
 * synced: there the socket keeps the last-synced copy matching the server, so
 * a Push would be a known no-op.
 *
 * - `manual` rooms have no socket, so another device may have overwritten the
 *   blob unseen — re-pushing an unchanged copy is legitimate (and also how the
 *   creator re-sends the TTL), so Push stays enabled.
 * - `typing` rooms show "Sync now", which stays available as a manual nudge.
 */
export function isPushDisabled(
  syncMode: SyncMode,
  busy: boolean,
  hasUnsyncedChanges: boolean,
): boolean {
  return busy || (syncMode === "push" && !hasUnsyncedChanges);
}
