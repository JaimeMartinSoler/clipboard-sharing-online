import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  estimatePassword,
  MIN_PASSWORD_LENGTH,
  type StrengthLevel,
} from "@/lib/password-strength";

/** Fill colour for the lit bars at each level. */
const LEVEL_COLOR: Record<StrengthLevel, string> = {
  none: "bg-border",
  weak: "bg-destructive",
  fair: "bg-green-400",
  strong: "bg-green-600",
};

/** The message under the bars at each level (bold spans emphasised). */
const LEVEL_MESSAGE: Record<StrengthLevel, ReactNode> = {
  none: <>Type a password, length min {MIN_PASSWORD_LENGTH}</>,
  weak: (
    <>
      Strength: <span className="font-medium">Weak</span>, type a password,
      length min {MIN_PASSWORD_LENGTH}
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
 * Three-segment strength meter. A short password is the dominant risk in this
 * fixed-salt design, so the meter is always shown to steer users toward a longer
 * passphrase (docs/SECURITY.md). Bars and copy are purely length-based.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { level, bars } = estimatePassword(password);

  return (
    <div className="space-y-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < bars ? LEVEL_COLOR[level] : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{LEVEL_MESSAGE[level]}</p>
    </div>
  );
}
