/**
 * Practical, length-based passphrase strength for the entry view.
 *
 * Security rests primarily on passphrase length (fixed-salt design — see
 * docs/SECURITY.md), so this is deliberately a coarse *length* gauge rather than
 * an entropy cracker. It maps a password to one of four levels the meter renders
 * as three bars, steering users toward at least 4 characters (and ideally 8+).
 */
export type StrengthLevel = "none" | "weak" | "fair" | "strong";

export interface PasswordStrength {
  level: StrengthLevel;
  /** How many of the meter's three bars are filled (0..3). */
  bars: 0 | 1 | 2 | 3;
}

/** Minimum length the UI nudges users to reach. */
export const MIN_PASSWORD_LENGTH = 4;

export function estimatePassword(password: string): PasswordStrength {
  const len = password.length;
  if (len === 0) return { level: "none", bars: 0 };
  if (len < MIN_PASSWORD_LENGTH) return { level: "weak", bars: 1 };
  if (len < 8) return { level: "fair", bars: 2 };
  return { level: "strong", bars: 3 };
}
