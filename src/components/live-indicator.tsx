"use client";

import { Hint } from "@/components/hint";
import type { LiveStatus } from "@/components/use-live-room";
import { cn } from "@/lib/utils";

const STYLES: Record<
  Exclude<LiveStatus, "off">,
  { dot: string; label: string; hint: string }
> = {
  connecting: {
    dot: "bg-amber-500 animate-pulse",
    label: "Connecting…",
    hint: "Opening the live connection to this room.",
  },
  connected: {
    dot: "bg-emerald-500",
    label: "Live",
    hint: "Connected — pushes from the other terminals appear here instantly.",
  },
  reconnecting: {
    dot: "bg-amber-500 animate-pulse",
    label: "Reconnecting…",
    hint: "Live connection lost — retrying. Push/Pull keep working meanwhile.",
  },
};

/** Small always-visible connection dot for rooms in a live sync mode. */
export function LiveIndicator({ status }: { status: LiveStatus }) {
  if (status === "off") return null;
  const style = STYLES[status];
  return (
    <Hint text={style.hint}>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("size-2 rounded-full", style.dot)} aria-hidden />
        {style.label}
      </span>
    </Hint>
  );
}
