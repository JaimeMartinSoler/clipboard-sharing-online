/**
 * Shareable room links carry the password in the URL **fragment** (`#p=…`),
 * never the path or query. The fragment is the one part of a URL browsers never
 * put on the wire — it is not sent in the HTTP request line, so the password
 * still never leaves the browser (see docs/SECURITY.md). base64url here is just
 * transport encoding (trivially reversible): sharing the link *is* sharing the
 * decryption ability, which is exactly the intent of a share button.
 *
 * The password is UTF-8 → base64url encoded. Pure module: no DOM, so it is unit
 * testable and reusable for both building links (Share/QR) and consuming an
 * inbound auto-join link.
 */
import { bytesToBase64url, base64urlToBytes } from "./crypto";
import { err, ok, type Result } from "./result";

/** The fragment key that holds the encoded password. */
const HASH_KEY = "p";

/** Encode a password into the `#p=…` fragment (leading `#` included). */
export function encodePasswordHash(password: string): string {
  const bytes = new TextEncoder().encode(password);
  return `#${HASH_KEY}=${bytesToBase64url(bytes)}`;
}

/**
 * Extract a password from a URL fragment, or null if absent/malformed. Accepts
 * the raw `location.hash` (with or without the leading `#`). Never throws.
 */
export function decodePasswordHash(hash: string): string | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  // The fragment may hold several `k=v` params; find ours.
  for (const part of raw.split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) !== HASH_KEY) continue;
    const value = part.slice(eq + 1);
    if (value.length === 0) return null;
    try {
      const decoded = new TextDecoder().decode(base64urlToBytes(value));
      return decoded.length === 0 ? null : decoded;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Build an absolute share URL for a password: `<origin>/#p=…`. The origin is
 * passed in (from `window.location.origin`) so this stays pure and testable.
 */
export function buildShareUrl(origin: string, password: string): Result<string> {
  if (password.length === 0) return err("No password to share.");
  // Normalise: drop any trailing slash so we don't emit `origin//#p=`.
  const base = origin.replace(/\/+$/, "");
  return ok(`${base}/${encodePasswordHash(password)}`);
}
