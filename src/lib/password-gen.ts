/**
 * Client-only random password generators used by the "Simple" / "Safer" buttons
 * on the entry view. Randomness comes from WebCrypto (`crypto.getRandomValues`),
 * never `Math.random`. These only *suggest* a password — the user may still type
 * their own — and, like everything else here, the value never leaves the browser.
 */

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SPECIAL = "!@#$%^&*-_=+";

/** Uniform random index in `[0, max)` via rejection sampling (no modulo bias). */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

/** Pick one random character from `alphabet`. */
function pick(alphabet: string): string {
  return alphabet[randomIndex(alphabet.length)];
}

/**
 * Easy-to-share password: 4 uppercase ASCII letters followed by 2 digits
 * (e.g. `ABCD12`). Short and memorable — Fair on the meter.
 */
export function generateSimplePassword(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += pick(UPPER);
  for (let i = 0; i < 2; i++) out += pick(DIGITS);
  return out;
}

/**
 * Strong password: 16 characters drawn from upper- and lower-case letters,
 * digits and special characters. Hard to memorise — best shared via link/QR.
 */
export function generateSaferPassword(): string {
  const alphabet = UPPER + LOWER + DIGITS + SPECIAL;
  let out = "";
  for (let i = 0; i < 16; i++) out += pick(alphabet);
  return out;
}
