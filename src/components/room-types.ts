import type { MemberRole } from "@/lib/api";
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
}

export interface Status {
  kind: BannerKind;
  message: string;
}
