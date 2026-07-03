"use client";

import { ClipboardPaste, Download, Trash2, Upload, Zap } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Hint } from "@/components/hint";
import { LiveIndicator } from "@/components/live-indicator";
import type { ConflictPolicy } from "@/components/room-types";
import type { LiveStatus } from "@/components/use-live-room";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { SyncMode } from "@/lib/api";

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
 * The shared clipboard editor — identical for creator and joiner. Encrypt-then-
 * Push, Pull-then-decrypt, Clear the local text box, Copy/Paste locally. The
 * Expiry selector (creator only) sets the TTL sent with the next Push. In live
 * modes the toolbar also shows the connection dot and the per-client conflict
 * policy ("on update: overwrite / warn").
 */
export function RoomEditor({
  text,
  onTextChange,
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
  const pushCopy = PUSH_LABELS[syncMode];

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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Text</h2>
          {isLive && <LiveIndicator status={liveStatus} />}
          {syncMode === "typing" && (
            <Hint text="This room auto-pushes shortly after you stop typing (and at most every few seconds while you type).">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="size-3" aria-hidden /> auto-syncs as you type
              </span>
            </Hint>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CopyButton value={text} />
          <Hint text="Paste from your device clipboard into the text box.">
            <Button size="sm" variant="outline" onClick={handlePaste}>
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
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          disabled={busyAny}
          onClick={onPush}
          hint={pushCopy.hint}
          icon={<Upload />}
          label={busy === "push" ? pushCopy.busyLabel : pushCopy.label}
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
          variant="outline"
        />
        <ActionButton
          disabled={busyAny}
          onClick={onClear}
          hint="Clear the text box here. This is local only — it does not touch the server; use Push to overwrite the shared blob."
          icon={<Trash2 />}
          label="Clear"
          variant="outline"
        />

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {isLive && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              On update
              <Hint text="What happens when another terminal pushes while you have unsaved edits: replace your text anyway, or keep it and warn you (Pull loads it).">
                <Select
                  value={conflictPolicy}
                  onChange={(e) =>
                    onConflictPolicyChange(e.target.value as ConflictPolicy)
                  }
                  aria-label="On update"
                >
                  <option value="overwrite">overwrite my text</option>
                  <option value="warn">warn, keep my edits</option>
                </Select>
              </Hint>
            </label>
          )}
          {canSetExpiry && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Expiry
              <Hint text="How long a pushed blob lives on the server. Shorter is safer.">
                <Select
                  value={ttlMs}
                  onChange={(e) => onTtlChange(Number(e.target.value))}
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

/** Push/Pull/Clear share the disabled-with-hint pattern. */
function ActionButton({
  disabled,
  onClick,
  hint,
  icon,
  label,
  variant = "default",
}: {
  disabled: boolean;
  onClick: () => void;
  hint: string;
  icon: React.ReactNode;
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <Hint text={hint}>
      <Button size="sm" variant={variant} onClick={onClick} disabled={disabled}>
        {icon} {label}
      </Button>
    </Hint>
  );
}
