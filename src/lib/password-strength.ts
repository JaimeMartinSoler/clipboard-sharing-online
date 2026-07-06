/**
 * Practical passphrase feedback for the entry view.
 *
 * Security rests primarily on passphrase entropy (fixed-salt design — see
 * docs/SECURITY.md), and length is by far the biggest lever a human controls.
 * Rather than a fuzzy entropy number, this maps a password to three plain tiers
 * so the meter reads at a glance: type something, make it shareable, make it
 * strong. On top of length it also demotes *trivially guessable* passwords to
 * `weak` regardless of length (see `isWeakPassword`), so `abcd`, `12121212` or
 * `qwerty` never green-light the Create/Join buttons.
 *
 * The weak-check is deliberately simple and linear: no recursion and no entropy
 * scoring, both of which misbehaved on long inputs. It only catches the obvious
 * junk and otherwise trusts length.
 */
export type StrengthLevel = "none" | "weak" | "fair" | "strong";

export interface PasswordStrength {
  level: StrengthLevel;
  /** How many of the three meter bars are filled (0..3). */
  filledBars: 0 | 1 | 2 | 3;
}

/** Below this a password is always weak; at/above `MIN_STRONG_LENGTH` it is strong. */
const MIN_LENGTH = 4;
const MIN_STRONG_LENGTH = 8;

/**
 * Common weak words / keyboard runs that shouldn't form a password's backbone.
 * They are stripped out (once each) before judging what remains, so a password
 * built around one of them (`qwerty`, `hello123`) is weak while a strong
 * password that merely contains one as a substring (`pass034vg$%&BV`) stays
 * strong.
 */
const FORBIDDEN_WORDS = [
  "password",
  "passwd",
  "pass",
  "qwerty",
  "asdf",
  "zxcv",
  "admin",
  "login",
  "user",
  "root",
  "key",
  "secret",
  "null",
  "test",
  "hello",
  "welcome",
  "letmein",
  "clipboard",
];

/** Longest run of chars each ±1 in code point from the previous (e.g. `abcd`). */
function longestConsecutiveRun(s: string): number {
  if (s.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < s.length; i++) {
    const diff = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (diff === 1 || diff === -1) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }
  return best;
}

/**
 * Whether a password is weak. A single linear pass — no recursion, no entropy
 * math — so it stays fast and predictable on inputs of any length:
 *  - shorter than {@link MIN_LENGTH};
 *  - too few distinct characters (`0000`, `1212`, `papapa`);
 *  - almost entirely one ascending/descending run (`abcd`, `12345678`);
 *  - or nothing but forbidden filler words once they are removed (`qwerty`,
 *    `hello123`) — a strong remainder survives (`pass034vg$%&BV`).
 */
export function isWeakPassword(pw: string): boolean {
  if (pw.length < MIN_LENGTH) return true;

  // Remove each common weak word once, then judge the remaining "core".
  let core = pw.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    core = core.split(word).join("");
  }
  if (core.length < MIN_LENGTH) return true;

  // Too little variety, e.g. "0000" or "121212".
  if (new Set(core).size < 3) return true;

  // Essentially a single keyboard/number run, e.g. "abcd" or "12345678".
  const run = longestConsecutiveRun(core);
  if (run >= 4 && run >= core.length - 1) return true;

  return false;
}

/**
 * Map a password to its strength tier:
 *  - `none`   (empty)            — nothing typed yet
 *  - `weak`   (short or simple)  — too short or trivially guessable
 *  - `fair`   (4–7 chars, ok)    — usable and easy to remember for sharing
 *  - `strong` (≥8 chars, ok)     — hard to remember; share via link/QR instead
 */
export function estimatePassword(password: string): PasswordStrength {
  const len = password.length;
  if (len === 0) return { level: "none", filledBars: 0 };
  if (isWeakPassword(password)) return { level: "weak", filledBars: 1 };
  if (len < MIN_STRONG_LENGTH) return { level: "fair", filledBars: 2 };
  return { level: "strong", filledBars: 3 };
}
