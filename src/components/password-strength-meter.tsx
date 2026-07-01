import { cn } from "@/lib/utils";
import { estimatePassword } from "@/lib/password-strength";

const BAR_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-green-500",
  "bg-green-600",
] as const;

/**
 * Four-segment strength meter. A weak password is the dominant risk in this
 * fixed-salt design, so the meter is always shown to steer users toward long,
 * high-entropy passphrases (docs/SECURITY.md).
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label, bits } = estimatePassword(password);
  const filled = password.length === 0 ? 0 : score + 1;

  return (
    <div className="space-y-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < filled ? BAR_COLORS[score] : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {password.length === 0 ? (
          "Use a long passphrase — several random words beat a short complex one."
        ) : (
          <>
            Strength: <span className="font-medium">{label}</span> (~{bits} bits)
          </>
        )}
      </p>
    </div>
  );
}
