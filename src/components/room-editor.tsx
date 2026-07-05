"use client";

import {
  ClipboardPaste,
  Download,
  Hand,
  type LucideIcon,
  RadioTower,
  Redo2,
  Trash2,
  Undo2,
  Upload,
  Zap,
} from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Hint } from "@/components/hint";
import { LiveIndicator } from "@/components/live-indicator";
import type { ConflictPolicy } from "@/components/room-types";
import type { LiveStatus } from "@/components/use-live-room";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { SyncMode } from "@/lib/api";
import { cn } from "@/lib/utils";

export const TTL_OPTIONS = [
  { label: "1 minute", ms: 60_000 },
  { label: "10 minutes", ms: 600_000 },
  { label: "1 hour", ms: 3_600_000 },
] as const;

/** Busy states the editor reacts to (subset of the app's busy union). */
export type EditorBusy = "push" | "pull" | "clear" | null;

/** Per-mode copy for the primary send button. */
const PUSH_LABELS: Record<SyncMode, { label: string; busyLabel: string; hint: string }> = {
  manual: {
    label: "Push",
    busyLabel: "Pushing…",
    hint: "Encrypt this text in your browser and upload it, replacing the room's blob.",
  },
  push: {
    label: "Push",
    busyLabel: "Pushing…",
    hint: "Encrypt and upload — the other terminals receive it instantly over the live connection.",
  },
  typing: {
    label: "Sync now",
    busyLabel: "Syncing…",
    hint: "Text auto-syncs shortly after you stop typing; this sends what's pending right away.",
  },
};

/**
 * Per-mode indicator shown next to the "Text" heading: an icon + short label
 * describing how content moves in this room, with a fuller explanation on hover.
 */
const SYNC_MODE_INFO: Record<
  SyncMode,
  { Icon: LucideIcon; label: string; hint: string }
> = {
  manual: {
    Icon: Hand,
    label: "manual push & pull",
    hint: "Nothing is automatic — use Push to upload your text and Pull to fetch the room's latest.",
  },
  push: {
    Icon: RadioTower,
    label: "broadcast push",
    hint: "You Push explicitly, but the other terminals receive it instantly over the live connection.",
  },
  typing: {
    Icon: Zap,
    label: "auto-sync push & pull",
    hint: "This room auto-pushes shortly after you stop typing (and at most every few seconds while you type); updates arrive live.",
  },
};

/**
 * The shared clipboard editor — identical for creator and joiner. Encrypt-then-
 * Push, Pull-then-decrypt, Clear the local text box, Undo/Redo/Copy/Paste
 * locally. The Expiry selector (creator only) sets the TTL sent with the next
 * Push. In live modes the toolbar also shows the connection dot and the
 * per-client conflict policy ("on update: overwrite / warn").
 */
export function RoomEditor({
  text,
  onTextChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  ttlMs,
  onTtlChange,
  busy,
  onPush,
  onPull,
  onClear,
  canSetExpiry,
  syncMode,
  liveStatus,
  conflictPolicy,
  onConflictPolicyChange,
}: {
  text: string;
  onTextChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  ttlMs: number;
  onTtlChange: (value: number) => void;
  busy: EditorBusy;
  onPush: () => void;
  onPull: () => void;
  onClear: () => void;
  /** Only the creator may choose the server-side TTL. */
  canSetExpiry: boolean;
  /** The room's sync mode (fixed at creation) — decides the button set. */
  syncMode: SyncMode;
  liveStatus: LiveStatus;
  conflictPolicy: ConflictPolicy;
  onConflictPolicyChange: (value: ConflictPolicy) => void;
}) {
  const busyAny = busy !== null;
  const isLive = syncMode !== "manual";
  // How many trailing selectors ("On update" and/or "Expiry") render, so the
  // portrait grid can split the row between them.
  const controlCount = (isLive ? 1 : 0) + (canSetExpiry ? 1 : 0);
  const pushCopy = PUSH_LABELS[syncMode];
  const mode = SYNC_MODE_INFO[syncMode];

  async function handlePaste() {
    try {
      const pasted = await navigator.clipboard.readText();
      onTextChange(pasted);
    } catch {
      // Clipboard API unavailable/denied (e.g. insecure context) — fail quietly.
    }
  }

  return (
    <section className="flex flex-col gap-2">
      {/* Portrait: the heading row, then the four edit buttons as a full-width
          equal-column row above the textarea. Landscape: the buttons move to
          the right of the heading. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Text</h2>
          <Hint text={mode.hint}>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <mode.Icon className="size-3" aria-hidden /> {mode.label}
            </span>
          </Hint>
          {/* Live dot sits to the right of the broadcast/sync-mode text. */}
          {isLive && <LiveIndicator status={liveStatus} />}
        </div>
        <div className="grid w-full grid-cols-4 gap-2 sm:inline-grid sm:w-auto">
          <Hint text="Undo the last change to the text box.">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onUndo}
              disabled={!canUndo}
            >
              <Undo2 /> Undo
            </Button>
          </Hint>
          <Hint text="Redo a change you just undid.">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onRedo}
              disabled={!canRedo}
            >
              <Redo2 /> Redo
            </Button>
          </Hint>
          <Hint text="Copy the current text to your device clipboard.">
            <CopyButton value={text} className="w-full" />
          </Hint>
          <Hint text="Paste from your device clipboard into the text box.">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handlePaste}
            >
              <ClipboardPaste /> Paste
            </Button>
          </Hint>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Type or paste the text to share…"
        spellCheck={false}
        className="min-h-60 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Push/Pull/Clear: equal columns that never resize when a label swaps
            to its busy form ("Pull" → "Pulling…"), so the row can't jump. */}
        <div className="grid w-full grid-cols-3 gap-2 sm:inline-grid sm:w-auto">
          <ActionButton
            disabled={busyAny}
            onClick={onPush}
            hint={pushCopy.hint}
            icon={<Upload />}
            label={busy === "push" ? pushCopy.busyLabel : pushCopy.label}
            reserve={pushCopy.label.length >= pushCopy.busyLabel.length ? pushCopy.label : pushCopy.busyLabel}
          />
          <ActionButton
            disabled={busyAny}
            onClick={onPull}
            hint={
              isLive
                ? "Fetch the room's current blob and decrypt it here — the manual fallback, and how you load an update you were warned about."
                : "Download the room's blob and decrypt it here. A wrong password simply fails to decrypt."
            }
            icon={<Download />}
            label={busy === "pull" ? "Pulling…" : "Pull"}
            reserve="Pulling…"
            variant="outline"
          />
          <ActionButton
            disabled={busyAny}
            onClick={onClear}
            hint="Clear the text box here. This is local only — it does not touch the server; use Push to overwrite the shared blob."
            icon={<Trash2 />}
            label="Clear"
            reserve="Clear"
            variant="outline"
          />
        </div>

        <div
          className={cn(
            // Portrait: On update / Expiry share the full width — two equal
            // columns when both show, one full-width column otherwise.
            "grid w-full gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3",
            controlCount === 2 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {isLive && (
            <label className="flex w-full items-center gap-1 text-xs text-muted-foreground sm:w-auto">
              On update
              <Hint text="What happens when another terminal pushes while you have unsaved edits: replace your text anyway, or keep it and warn you (Pull loads it).">
                <Select
                  value={conflictPolicy}
                  onChange={(e) =>
                    onConflictPolicyChange(e.target.value as ConflictPolicy)
                  }
                  containerClassName="flex-1 sm:flex-none"
                  className="w-full"
                  aria-label="On update"
                >
                  <option value="overwrite">overwrite my text</option>
                  <option value="warn">warn, keep my edits</option>
                </Select>
              </Hint>
            </label>
          )}
          {canSetExpiry && (
            <label className="flex w-full items-center gap-1 text-xs text-muted-foreground sm:w-auto">
              Expiry
              <Hint text="How long a pushed blob lives on the server. Shorter is safer.">
                <Select
                  value={ttlMs}
                  onChange={(e) => onTtlChange(Number(e.target.value))}
                  containerClassName="flex-1 sm:flex-none"
                  className="w-full"
                  aria-label="Expiry"
                >
                  {TTL_OPTIONS.map((o) => (
                    <option key={o.ms} value={o.ms}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Hint>
            </label>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Push/Pull/Clear share the disabled-with-hint pattern. `reserve` is the widest
 * label the button can ever show; an invisible copy holds that width so the
 * button (and the equal-column grid around it) never resizes when the visible
 * label swaps to its busy form.
 */
function ActionButton({
  disabled,
  onClick,
  hint,
  icon,
  label,
  reserve,
  variant = "default",
}: {
  disabled: boolean;
  onClick: () => void;
  hint: string;
  icon: React.ReactNode;
  label: string;
  reserve: string;
  variant?: "default" | "outline";
}) {
  return (
    <Hint text={hint}>
      <Button
        size="sm"
        variant={variant}
        onClick={onClick}
        disabled={disabled}
        className="w-full"
      >
        {icon}
        <span className="relative inline-block">
          <span aria-hidden className="invisible">
            {reserve}
          </span>
          <span className="absolute inset-0 flex items-center justify-center">
            {label}
          </span>
        </span>
      </Button>
    </Hint>
  );
}
