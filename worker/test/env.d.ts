import type { D1Migration } from "cloudflare:test";

// Bindings the test worker sees. @cloudflare/vitest-pool-workers ≥0.17 types
// `env` as the global `Cloudflare.Env` (the `wrangler types` convention), so
// that is what we augment here.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
      TTL_DEFAULT_MS: string;
      TTL_MAX_MS: string;
      MAX_CIPHERTEXT_BYTES: string;
      RATE_LIMIT_MAX: string;
      RATE_LIMIT_WINDOW_MS: string;
    }
  }
}

export {};
