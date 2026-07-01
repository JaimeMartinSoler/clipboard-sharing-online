import type { D1Migration } from "cloudflare:test";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
    TTL_DEFAULT_MS: string;
    TTL_MAX_MS: string;
    MAX_CIPHERTEXT_BYTES: string;
    RATE_LIMIT_MAX: string;
    RATE_LIMIT_WINDOW_MS: string;
  }
}
