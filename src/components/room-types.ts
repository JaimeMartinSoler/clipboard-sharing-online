import type { MemberRole, SyncMode } from "@/lib/api";
import type { BannerKind } from "@/components/status-banner";

/**
 * A live room membership. Held in memory only (never persisted): a reload or
 * closed tab forfeits the slot, which still counts against the cap until TTL.
 */
export interface Session {
  roomId: string;
  token: string;
  contentKey: CryptoKey;
  /** 1-based terminal number when this membership was granted. */
  slot: number;
  capacity: number;
  sealed: boolean;
  role: MemberRole;
  /** The room's sync mode, fixed by the creator at creation. */
  syncMode: SyncMode;
}

/**
 * What to do when a live update arrives while the local text has unsaved
 * edits. Per-client, in-memory, switchable anytime: `overwrite` replaces the
 * textarea regardless; `warn` keeps the edits and surfaces a banner instead.
 */
export type ConflictPolicy = "overwrite" | "warn";

export interface Status {
  kind: BannerKind;
  message: string;
}
