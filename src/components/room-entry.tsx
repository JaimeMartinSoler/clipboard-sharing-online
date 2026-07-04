"use client";

import {
  Code,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LockKeyhole,
  LogIn,
  Plus,
  RotateCcw,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SyncMode } from "@/lib/api";
import {
  generateSaferPassword,
  generateSimplePassword,
} from "@/lib/password-gen";
import { estimatePassword } from "@/lib/password-strength";

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
 */
export function RoomEntry({
  password,
  onPasswordChange,
  showPassword,
  onToggleShowPassword,
  capacity,
  onCapacityChange,
  syncMode,
  onSyncModeChange,
  busy,
  onCreate,
  onJoin,
  statusBanner,
}: {
  password: string;
  onPasswordChange: (value: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  capacity: number;
  onCapacityChange: (value: number) => void;
  syncMode: SyncMode;
  onSyncModeChange: (value: SyncMode) => void;
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
              onClick={() => onPasswordChange(generateSimplePassword())}
              title="Generate a short random password that's easy to read aloud or retype"
            >
              <RotateCcw /> Password Simple
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => onPasswordChange(generateSaferPassword())}
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
            placeholder="Type a room password for creator and joiners"
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

        <div className="mt-1 grid gap-4 sm:grid-cols-2">
          {/* Create */}
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <div className="text-sm font-medium">Create a room</div>
            <p className="text-xs text-muted-foreground">
              You become the creator and set how many terminals may share it. The
              room seals when full.
            </p>
            <label
              htmlFor="capacity"
              className="flex flex-col gap-1 text-xs text-muted-foreground"
            >
              Terminals
              <Select
                id="capacity"
                containerClassName="w-full"
                className="w-full text-center"
                value={capacity}
                onChange={(e) => onCapacityChange(Number(e.target.value))}
                aria-label="Terminals"
                title="How many devices may share this room. The room seals at this count; only the creator sets it."
              >
                {CAPACITY_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
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
            <Button
              size="sm"
              className="mt-auto"
              onClick={onCreate}
              disabled={disabled}
            >
              <Plus /> {busy === "create" ? "Creating…" : "Create room"}
            </Button>
          </div>

          {/* Join */}
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <div className="text-sm font-medium">Join a room</div>
            <p className="text-xs text-muted-foreground">
              Join a room someone else created with this password — or just open
              their share link, which joins automatically.
            </p>
            <Button
              size="sm"
              className="mt-auto"
              onClick={onJoin}
              disabled={disabled}
            >
              <LogIn /> {busy === "join" ? "Joining…" : "Join room"}
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-foreground" />
          <span>
            <strong>Clipboard text is encrypted</strong> in your browser, never
            sent or stored directly
          </span>
        </p>
        <p className="flex items-start gap-2">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-foreground" />
          <span>
            <strong>Password is never sent nor stored</strong>
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0 text-foreground" />
          <span>
            <strong>Rooms are sealed</strong>, once full no one else can enter
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Code className="mt-0.5 size-4 shrink-0 text-foreground" />
          <span>
            <strong>Highly configurable</strong> but simple by default
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
          <span>
            For more info check our{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-foreground"
            >
              privacy policy
            </Link>
          </span>
        </p>
      </section>
    </>
  );
}
