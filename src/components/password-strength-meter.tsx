import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  estimatePassword,
  type StrengthLevel,
} from "@/lib/password-strength";

/** Fill colour for each level (unfilled bars use the muted border colour). */
const BAR_COLOR: Record<StrengthLevel, string> = {
  none: "bg-border",
  weak: "bg-destructive",
  fair: "bg-green-400",
  strong: "bg-green-600",
};

/** The caption shown under the bars for each level. */
const CAPTION: Record<StrengthLevel, ReactNode> = {
  none: "Type a password, length min 4",
  weak: (
    <>
      Strength: <span className="font-medium">Weak</span> — type a password,
      length min 4
    </>
  ),
  fair: (
    <>
      Strength: <span className="font-medium">Fair</span>, but easy to{" "}
      <span className="font-medium">remember</span> for sharing
    </>
  ),
  strong: (
    <>
      Strength: <span className="font-medium">Strong</span>, but hard to
      remember. Share with <span className="font-medium">link</span> or{" "}
      <span className="font-medium">QR</span> from room
    </>
  ),
};

/**
 * Three-bar, length-based strength meter. A weak password is the dominant risk
 * in this fixed-salt design, so the meter is always shown to steer users toward
 * a shareable-or-strong passphrase (docs/SECURITY.md).
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { level, filledBars } = estimatePassword(password);

  return (
    <div className="space-y-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < filledBars ? BAR_COLOR[level] : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{CAPTION[level]}</p>
    </div>
  );
}
