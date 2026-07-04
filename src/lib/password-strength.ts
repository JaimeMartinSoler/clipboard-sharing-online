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
 */
export type StrengthLevel = "none" | "weak" | "fair" | "strong";

export interface PasswordStrength {
  level: StrengthLevel;
  /** How many of the three meter bars are filled (0..3). */
  filledBars: 0 | 1 | 2 | 3;
}

/**
 * Common weak words / keyboard runs that shouldn't form a password's backbone.
 * They only make a password weak when what *remains* after removing them is
 * itself weak (see `isWeakPassword`), so a strong password that merely contains
 * one of these substrings stays strong.
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
 * True when the password is a trivially guessable pattern regardless of length:
 * too few distinct characters (`0000`, `1212`, `papapa`) or a long ascending /
 * descending run that covers most of it (`abcd`, `12345678`).
 */
function isSimplePattern(pw: string): boolean {
  const distinct = new Set(pw).size;
  if (distinct < 3) return true;
  if (pw.length >= 6 && distinct / pw.length < 0.4) return true;
  const run = longestConsecutiveRun(pw);
  if (run >= 4 && run >= Math.ceil(pw.length * 0.6)) return true;
  return false;
}

/**
 * Whether a password is weak — too short, a simple pattern, or built around a
 * forbidden word. The forbidden-word check is *recursive*: a word only counts
 * against the password when removing it leaves a still-weak remainder, so
 * `key1234` is weak (because `1234` is) but `pass034vg$%&BV` is safe (because
 * `034vg$%&BV` is). Every recursion strips at least one character, so it
 * terminates.
 */
export function isWeakPassword(pw: string): boolean {
  if (pw.length < 4) return true;
  if (isSimplePattern(pw)) return true;
  const lower = pw.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    const idx = lower.indexOf(word);
    if (idx !== -1) {
      const remainder = pw.slice(0, idx) + pw.slice(idx + word.length);
      if (isWeakPassword(remainder)) return true;
    }
  }
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
  if (len < 8) return { level: "fair", filledBars: 2 };
  return { level: "strong", filledBars: 3 };
}
