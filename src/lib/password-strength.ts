/**
 * Lightweight, dependency-free passphrase strength estimate.
 *
 * Security rests primarily on passphrase entropy (fixed-salt design — see
 * docs/SECURITY.md), so the UI nudges users toward long, varied passphrases.
 * This is a coarse entropy heuristic (character-class pool × length), NOT a
 * dictionary cracker — it intentionally rewards length most.
 */
export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthScore;
  label: string;
  /** Estimated entropy in bits (coarse). */
  bits: number;
}

const LABELS: Record<StrengthScore, string> = {
  0: "Very weak",
  1: "Weak",
  2: "Fair",
  3: "Strong",
  4: "Very strong",
};

function poolSize(password: string): number {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33; // punctuation/space/etc.
  return pool;
}

function scoreFromBits(bits: number): StrengthScore {
  if (bits < 28) return 0;
  if (bits < 40) return 1;
  if (bits < 60) return 2;
  if (bits < 80) return 3;
  return 4;
}

export function estimatePassword(password: string): PasswordStrength {
  if (password.length === 0) {
    return { score: 0, label: "Empty", bits: 0 };
  }
  const pool = poolSize(password);
  // log2(pool) bits of entropy per character (upper bound assuming randomness).
  const bits = pool > 0 ? Math.round(password.length * Math.log2(pool)) : 0;
  const score = scoreFromBits(bits);
  return { score, label: LABELS[score], bits };
}
