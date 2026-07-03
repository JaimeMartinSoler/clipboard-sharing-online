/**
 * Client-side random-password generators for the entry view.
 *
 * Both draw from WebCrypto (`crypto.getRandomValues`) with rejection sampling
 * so the character choice carries no modulo bias. Like every password in this
 * app, the result never leaves the browser — it only seeds key derivation.
 */

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SPECIAL = "!@#$%^&*()-_=+[]{};:,.?";

/**
 * A uniform integer in `[0, max)` via rejection sampling — draws a fresh 32-bit
 * value until it falls in the largest unbiased range, then reduces modulo `max`.
 */
function randomInt(max: number): number {
  // `max` is always a small positive constant here; guard defensively anyway.
  if (max <= 0) return 0;
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0] ?? 0;
  } while (n >= limit);
  return n % max;
}

/** Pick one random character from a set. */
function pick(set: string): string {
  return set.charAt(randomInt(set.length));
}

/** Fisher–Yates shuffle in place using crypto randomness. */
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = chars[i] ?? "";
    const b = chars[j] ?? "";
    chars[i] = b;
    chars[j] = a;
  }
  return chars;
}

/**
 * Simple password — 6 chars: four uppercase ASCII letters followed by two
 * digits (e.g. `KQWZ47`). Short and easy to read aloud or retype when the two
 * devices are side by side.
 */
export function generateSimplePassword(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += pick(UPPER);
  for (let i = 0; i < 2; i++) out += pick(DIGITS);
  return out;
}

/**
 * Safer password — 16 chars mixing upper- and lower-case letters, digits and
 * specials, with at least one of each class guaranteed, then shuffled. Meant to
 * be shared via the room's link/QR rather than memorised.
 */
export function generateSaferPassword(): string {
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  const chars: string[] = [
    pick(UPPER),
    pick(LOWER),
    pick(DIGITS),
    pick(SPECIAL),
  ];
  while (chars.length < 16) chars.push(pick(all));
  return shuffle(chars).join("");
}
