"use client";

import { Eye, EyeOff, LogIn, Plus } from "lucide-react";
import { E2EBadge } from "@/components/e2e-badge";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SyncMode } from "@/lib/api";

export const CAPACITY_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Creator-facing labels for the room's sync mode (fixed at creation). */
export const SYNC_MODE_OPTIONS: { value: SyncMode; label: string }[] = [
  { value: "push", label: "Live — Push to send" },
  { value: "typing", label: "Live — sync as you type" },
  { value: "manual", label: "Manual — Push & Pull" },
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
}) {
  const disabled = password.length === 0 || busy !== null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Clipboard Sharing Online
        </h1>
        <p className="text-sm text-muted-foreground">
          Share text between your phone, PC, laptop and tablet — no accounts, no
          app to install. Agree on one password out-of-band,{" "}
          <strong>Create</strong> a room on one device and <strong>Join</strong>{" "}
          it on the others. Everything is encrypted in your browser; the server
          only ever stores ciphertext it cannot read.
        </p>
        <div>
          <E2EBadge />
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <label htmlFor="password" className="text-sm font-medium">
          Shared password
        </label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="off"
            placeholder="A long passphrase you share out-of-band"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="pr-9"
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
              Sharing
              <Select
                id="sync-mode"
                containerClassName="w-full"
                className="w-full"
                value={syncMode}
                onChange={(e) => onSyncModeChange(e.target.value as SyncMode)}
                aria-label="Sharing"
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
              variant="outline"
              className="mt-auto"
              onClick={onJoin}
              disabled={disabled}
            >
              <LogIn /> {busy === "join" ? "Joining…" : "Join room"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
