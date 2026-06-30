/**
 * Client-only zero-knowledge crypto core.
 *
 * Everything here runs in the browser (and in Node for tests) via WebCrypto +
 * hash-wasm. The password, the derived master material, and the AES-GCM content
 * key NEVER leave this module's caller — only the opaque `roomId`, `ciphertext`,
 * and `iv` are ever handed to the network layer. See docs/ARCHITECTURE.md and
 * docs/SECURITY.md.
 *
 * Pure module: no React/DOM imports. All user-facing failure modes return a
 * `Result` rather than throwing or leaking plaintext.
 */
import { argon2id } from "hash-wasm";
import { err, ok, type Result } from "./result";

/**
 * Argon2id cost parameters — the primary defense against an offline
 * dictionary/brute-force attack on the fixed-salt password (docs/SECURITY.md).
 *
 * "Balanced": 64 MiB memory, 3 iterations, 1 lane. Kept in ONE place and guarded
 * by a test (crypto.test.ts) that fails if any value is silently weakened.
 */
export const ARGON2_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65536, // KiB == 64 MiB
  hashLength: 32, // bytes of master key material
} as const;

/**
 * Fixed, public, app-wide salt. There is no per-user salt because the only
 * shared secret between two terminals is the password, and derivation must be
 * deterministic so both independently land on the same room + key. The cost of
 * this choice (offline precomputation) is analysed and mitigated in
 * docs/SECURITY.md.
 */
const APP_SALT = new TextEncoder().encode("cso:v1:fixed-app-salt:zk");

// HKDF info strings split the master material into two independent values.
const ROOM_ID_INFO = new TextEncoder().encode("cso:room-id");
const CONTENT_KEY_INFO = new TextEncoder().encode("cso:content-key");
// The master material is already uniformly random (Argon2id output), so HKDF is
// used purely to domain-separate; an empty extract salt is standard and keeps
// derivation deterministic.
const HKDF_SALT = new Uint8Array(0);

const ROOM_ID_BYTES = 16;

/**
 * Copy bytes into a guaranteed `ArrayBuffer`-backed view. WebCrypto's
 * `BufferSource` rejects `SharedArrayBuffer`-backed arrays at the type level
 * (TS lib.dom), and some library outputs (hash-wasm) are typed as the wider
 * `Uint8Array<ArrayBufferLike>`, so normalise before handing bytes to subtle.
 */
function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

export interface DerivedKeys {
  /** Opaque, deterministic id sent to the server. Reveals nothing about the password. */
  roomId: string;
  /** Non-extractable AES-GCM-256 key. Never leaves the browser. */
  contentKey: CryptoKey;
}

export interface EncryptedPayload {
  /** base64url AES-GCM ciphertext (GCM tag included). */
  ciphertext: string;
  /** base64url 96-bit nonce. */
  iv: string;
}

/** Derive `{ roomId, contentKey }` from a password. Returns a Result, never throws. */
export async function deriveKeys(password: string): Promise<Result<DerivedKeys>> {
  if (password.length === 0) {
    return err("Enter a password.");
  }
  try {
    const master = await argon2id({
      password,
      salt: APP_SALT,
      parallelism: ARGON2_PARAMS.parallelism,
      iterations: ARGON2_PARAMS.iterations,
      memorySize: ARGON2_PARAMS.memorySize,
      hashLength: ARGON2_PARAMS.hashLength,
      outputType: "binary",
    });

    const hkdfKey = await crypto.subtle.importKey(
      "raw",
      asBufferSource(master),
      "HKDF",
      false,
      ["deriveBits", "deriveKey"],
    );

    const roomIdBits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: ROOM_ID_INFO },
      hkdfKey,
      ROOM_ID_BYTES * 8,
    );
    const roomId = bytesToBase64url(new Uint8Array(roomIdBits));

    // Derive the AES-GCM key directly so the raw key bytes are never exposed,
    // and mark it non-extractable.
    const contentKey = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: CONTENT_KEY_INFO },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    return ok({ roomId, contentKey });
  } catch {
    return err("Could not derive keys from the password.");
  }
}

/** Encrypt plaintext with a fresh random 96-bit iv. Returns a Result, never throws. */
export async function encrypt(
  contentKey: CryptoKey,
  plaintext: string,
): Promise<Result<EncryptedPayload>> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      contentKey,
      data,
    );
    return ok({
      ciphertext: bytesToBase64url(new Uint8Array(ciphertext)),
      iv: bytesToBase64url(iv),
    });
  } catch {
    return err("Could not encrypt the text.");
  }
}

/**
 * Decrypt a payload. A wrong password (different key), tampered ciphertext, or
 * malformed input all surface as the same Result error — indistinguishable to
 * the user and on the wire (no existence/wrong-password oracle).
 */
export async function decrypt(
  contentKey: CryptoKey,
  payload: EncryptedPayload,
): Promise<Result<string>> {
  try {
    const iv = base64urlToBytes(payload.iv);
    const ciphertext = base64urlToBytes(payload.ciphertext);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      contentKey,
      ciphertext,
    );
    return ok(new TextDecoder().decode(plaintext));
  } catch {
    return err("Couldn't decrypt — check the password.");
  }
}

/** Encode bytes as unpadded, url-safe base64. */
export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode unpadded, url-safe base64 back to bytes. Throws on malformed input. */
export function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    base64.length % 4 === 0
      ? base64
      : base64 + "=".repeat(4 - (base64.length % 4));
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
