"use client";

import {
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LockKeyholeOpen,
  LogIn,
  Plus,
  RotateCcw,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import { PrivacyHighlights } from "@/components/privacy-highlights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapse } from "@/components/ui/collapse";
import { Select } from "@/components/ui/select";
import type { SyncMode } from "@/lib/api";
import { estimatePassword } from "@/lib/password-strength";
import type { PasswordKind } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export const CAPACITY_OPTIONS = [2, 3, 4, 5, 6];

/**
 * Creator-facing labels for the room's sync mode (fixed at creation). Native
 * <option> elements can't host React icons, so each label is prefixed with an
 * emoji glyph (pointing-hand / radio-tower / zap) as the closest accessible
 * equivalent.
 */
export const SYNC_MODE_OPTIONS: { value: SyncMode; label: string }[] = [
  { value: "manual", label: "🫵🏼 Manual: Push & Pull Manual" },
  { value: "push", label: "📡 Broadcast: Push Manual, Pull Auto" },
  { value: "typing", label: "⚡ Sync: Push & Pull Auto" },
];

/** Busy states the entry view cares about. */
export type EntryBusy = "create" | "join" | null;

/**
 * The landing view: pick a shared password, then either Create a room (you
 * become its creator and set the terminal cap) or Join an existing one. The
 * password never leaves the browser — it only derives the room id + key.
 *
 * The Create/Join buttons sit up top (the section titles they replaced were
 * redundant). The room's options live under a collapsed-by-default "Advanced
 * Settings" panel so a first-time user can just create and go — they only
 * apply to a room you create, never to joining.
 */
export function RoomEntry({
  password,
  onPasswordChange,
  onGeneratePassword,
  showPassword,
  onToggleShowPassword,
  sealedRoom,
  onSealedRoomChange,
  capacity,
  onCapacityChange,
  syncMode,
  onSyncModeChange,
  advancedOpen,
  onAdvancedOpenChange,
  busy,
  onCreate,
  onJoin,
  statusBanner,
}: {
  password: string;
  onPasswordChange: (value: string) => void;
  /** Generate a random password of the given style (parent remembers which). */
  onGeneratePassword: (kind: PasswordKind) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  /** Sealed (bounded, seals when full) vs open (unlimited, never seals). */
  sealedRoom: boolean;
  onSealedRoomChange: (value: boolean) => void;
  capacity: number;
  onCapacityChange: (value: number) => void;
  syncMode: SyncMode;
  onSyncModeChange: (value: SyncMode) => void;
  advancedOpen: boolean;
  onAdvancedOpenChange: (value: boolean) => void;
  busy: EntryBusy;
  onCreate: () => void;
  onJoin: () => void;
  /** The always-visible status line, rendered directly under the heading. */
  statusBanner: ReactNode;
}) {
  // The room key is only as strong as the password (fixed-salt design), so the
  // Create/Join actions unlock only once the password clears the weak tier.
  const { level } = estimatePassword(password);
  const disabled = level === "none" || level === "weak" || busy !== null;

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          Clipboard Sharing Online
        </h1>
        {statusBanner}
      </div>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        {/* Primary actions up top — the buttons speak for themselves, so the
            old "Create a room" / "Join a room" headings are gone. The room
            password field sits just below them. */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={onCreate} disabled={disabled}>
            <Plus /> {busy === "create" ? "Creating…" : "Create room"}
          </Button>
          <Button variant="outline" onClick={onJoin} disabled={disabled}>
            <LogIn /> {busy === "join" ? "Joining…" : "Join room"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="password" className="text-sm font-medium">
            Room password
          </label>
          {/* Portrait phones: the two buttons split the row 50-50 full-width.
              Wider screens (pc / landscape): an inline grid sizes both columns
              to the larger button so they stay equal without stretching. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:inline-grid sm:w-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => onGeneratePassword("simple")}
              title="Generate a short random password that's easy to read aloud or retype"
            >
              <RotateCcw /> Password Simple
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => onGeneratePassword("safer")}
              title="Generate a long, high-entropy password — share it via the room's link or QR"
            >
              <KeyRound /> Password Safer
            </Button>
          </div>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="off"
            placeholder="Type room password for creator and joiners"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="px-9 text-center"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={onToggleShowPassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        <PasswordStrengthMeter password={password} />

        {/* Advanced settings — collapsed by default, applies to created rooms.
            `bg-muted/50` matches the info status banner's badge background so the
            panel reads as the same soft surface (see docs/STYLE_MIGRATION.md). */}
        <div className="rounded-md border bg-muted/50">
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-controls="advanced-settings"
            onClick={() => onAdvancedOpenChange(!advancedOpen)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <span className="flex items-center gap-2">
              <Settings className="size-4 text-muted-foreground" />
              Advanced Settings
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                advancedOpen && "rotate-180",
              )}
            />
          </button>

          <Collapse
            open={advancedOpen}
            id="advanced-settings"
            className="flex flex-col gap-3 border-t p-3"
          >
            <p className="text-xs text-muted-foreground">
              These apply to a room <strong>you create</strong> — joining a room
              uses the creator&apos;s settings.
            </p>

            {/* Private / Public toggle. The row border and the off-state track
                use `accent` (one step darker than the `muted` panel) so they
                keep a visible edge — `border`/`bg-input` share the panel's
                lightness in light mode and would vanish (see STYLE_MIGRATION). */}
            <div className="flex flex-col gap-1">
              <button
                type="button"
                role="switch"
                aria-checked={sealedRoom}
                aria-label={sealedRoom ? "Private room" : "Public room"}
                onClick={() => onSealedRoomChange(!sealedRoom)}
                className="flex items-center justify-between gap-3 rounded-md border border-accent p-3 text-left transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {sealedRoom ? (
                    <LockKeyhole className="size-4 text-foreground" />
                  ) : (
                    <LockKeyholeOpen className="size-4 text-muted-foreground" />
                  )}
                  {sealedRoom ? "Private room" : "Public room"}
                </span>
                <span
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                    sealedRoom ? "bg-primary" : "bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform",
                      sealedRoom ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </span>
              </button>
              <p className="text-xs text-muted-foreground">
                {sealedRoom
                  ? "Seals once the terminal limit is reached — no one else can join, ever."
                  : "No terminal limit — anyone with the password can join at any time."}
              </p>
            </div>

            {/* Terminals — only meaningful for a sealed room. */}
            <label
              htmlFor="capacity"
              className={cn(
                "flex flex-col gap-1 text-xs",
                sealedRoom ? "text-muted-foreground" : "text-muted-foreground/60",
              )}
            >
              Terminals
              <Select
                id="capacity"
                containerClassName="w-full"
                className="w-full text-center"
                value={sealedRoom ? capacity : 0}
                disabled={!sealedRoom}
                onChange={(e) => onCapacityChange(Number(e.target.value))}
                aria-label="Terminals"
                title="How many devices may share this room. The room seals at this count. A public room has no limit."
              >
                {sealedRoom ? (
                  CAPACITY_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))
                ) : (
                  <option value={0}>∞ (no limit for public rooms)</option>
                )}
              </Select>
            </label>

            {/* Sharing mode */}
            <label
              htmlFor="sync-mode"
              className="flex flex-col gap-1 text-xs text-muted-foreground"
            >
              Sharing mode
              <Select
                id="sync-mode"
                containerClassName="w-full"
                className="w-full"
                value={syncMode}
                onChange={(e) => onSyncModeChange(e.target.value as SyncMode)}
                aria-label="Sharing mode"
                title="How text reaches the other terminals. Live modes deliver instantly over an encrypted connection; Manual keeps explicit Push and Pull only. Fixed for the room's lifetime."
              >
                {SYNC_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
          </Collapse>
        </div>
      </section>

      <PrivacyHighlights />
    </>
  );
}
