/**
 * Practical, length-based passphrase feedback for the entry view.
 *
 * Security rests primarily on passphrase entropy (fixed-salt design — see
 * docs/SECURITY.md), and length is by far the biggest lever a human controls.
 * Rather than a fuzzy entropy number, this maps length to three plain tiers so
 * the meter reads at a glance: type something, make it shareable, make it
 * strong.
 */
export type StrengthLevel = "none" | "weak" | "fair" | "strong";

export interface PasswordStrength {
  level: StrengthLevel;
  /** How many of the three meter bars are filled (0..3). */
  filledBars: 0 | 1 | 2 | 3;
}

/**
 * Map a password to its strength tier purely by length:
 *  - `none`   (0 chars)     — nothing typed yet
 *  - `weak`   (1–3 chars)   — too short to be safe
 *  - `fair`   (4–7 chars)   — usable and easy to remember for sharing
 *  - `strong` (≥8 chars)    — hard to remember; share via link/QR instead
 */
export function estimatePassword(password: string): PasswordStrength {
  const len = password.length;
  if (len === 0) return { level: "none", filledBars: 0 };
  if (len < 4) return { level: "weak", filledBars: 1 };
  if (len < 8) return { level: "fair", filledBars: 2 };
  return { level: "strong", filledBars: 3 };
}
