/**
 * Canonical, deploy-time site identity + SEO surface.
 *
 * Single source of truth for the production origin, brand name, and the
 * keyword-rich copy reused by page metadata, structured data, the sitemap, the
 * robots policy, and the web app manifest. Keep this the ONLY place the
 * absolute URL and the marketing description live.
 */
export const SITE_URL = "https://clipboard-sharing-online.com";
export const SITE_NAME = "Clipboard Sharing Online";

/** Short, human tagline used as the homepage title suffix. */
export const SITE_TAGLINE = "Text Between Devices, Encrypted";

/**
 * The homepage `<title>`. Kept under 60 chars so Google doesn't truncate it
 * (the test enforces the bound), while leading with the two highest-intent
 * phrases ("clipboard", "text between devices").
 */
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;

/**
 * Whether the build being produced is the production deploy that search
 * engines should index. The Pages deploy workflow builds every target with
 * the same `pnpm build`; GitHub Actions' default `GITHUB_REF_NAME` env var
 * names the branch being built, and only `main` goes to the production
 * origin. Every other build — the `develop` staging slot, ad-hoc
 * `workflow_dispatch` builds, local builds — serves the same content on a
 * non-canonical host and must not be indexed, so it ships a `disallow`-all
 * robots.txt and a `noindex` robots meta instead.
 */
export function isIndexableDeploy(refName: string | undefined): boolean {
  return refName === "main";
}

/** Resolved at build time (static export): true only for the `main` deploy. */
export const SITE_INDEXABLE = isIndexableDeploy(process.env.GITHUB_REF_NAME);

/**
 * The meta description / OpenGraph description. Written for a search snippet:
 * it names the concrete devices people search for (phone, PC, laptop, tablet)
 * and states the privacy guarantee that differentiates this tool. Kept within
 * the ~160-char snippet Google shows (pages.test.ts enforces it per route).
 */
export const SITE_DESCRIPTION =
  "Free online clipboard: share text between phone, PC, laptop and tablet. " +
  "End-to-end encrypted — the server only stores ciphertext it cannot read. " +
  "No sign-up.";

/**
 * Long-tail search phrases we want to rank for. `keywords` carries little
 * weight with Google today, but it documents intent and feeds the manifest /
 * structured data. Ordered roughly by search intent.
 */
export const SITE_KEYWORDS = [
  "clipboard share",
  "text share",
  "share text between devices",
  "online clipboard",
  "shared clipboard",
  "send text to my PC",
  "send text to my laptop",
  "send text to my smartphone",
  "copy paste between devices",
  "cross-device clipboard",
  "phone to PC clipboard",
  "send text to another device",
  "encrypted clipboard",
  "end-to-end encryption",
  "zero-knowledge",
];

/** Public source repository — linked from /about, the homepage and /security. */
export const REPO_URL =
  "https://github.com/JaimeMartinSoler/clipboard-sharing-online";

/** The person behind the site, for structured data (matches /about). */
export const SITE_AUTHOR = {
  name: "Jaime Martín Soler",
  url: "https://github.com/JaimeMartinSoler",
} as const;

/**
 * First production release (first `develop` → `main` merge, PR #8). A fixed
 * date, not a build timestamp, so structured data doesn't churn per deploy.
 */
export const SITE_PUBLISHED = "2026-07-01";

/**
 * The 1200×630 social card (`summary_large_image` / Open Graph) — the brand
 * logo, wordmark and tagline on the light-theme tokens. Link previews are the
 * app's growth loop (sharing a room link *is* the product), so this must be a
 * real large card, not the square favicon. `width`/`height` must match the
 * file; site.test.ts checks it. The favicon set lives alongside it in
 * `public/`: `favicon-32x32.png`, `icon.png` (256), `apple-touch-icon.png`
 * (180) and the header `logo.png`.
 */
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — end-to-end encrypted text between your devices`,
} as const;

/** User-facing feature bullets, reused by the manifest and structured data. */
export const SITE_FEATURES = [
  "Share text between phone, PC, laptop and tablet",
  "End-to-end encrypted with AES-GCM-256 in your browser",
  "Zero-knowledge server — stores only ciphertext it cannot read",
  "No sign-up, no accounts — meet on a single shared password",
  "Live sync as you type, or manual push and pull",
  "Ephemeral by default — content auto-expires",
];

/**
 * Serialize JSON-LD for an inline `<script type="application/ld+json">`.
 * Escapes `<` so no string value can ever close the script element early.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * schema.org JSON-LD describing the app as a free web application, so search
 * engines can surface it as a rich result. Absolute URLs only (crawlers do not
 * resolve relative paths in structured data).
 */
export function webApplicationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    image: `${SITE_URL}${OG_IMAGE.url}`,
    inLanguage: "en",
    datePublished: SITE_PUBLISHED,
    author: {
      "@type": "Person",
      name: SITE_AUTHOR.name,
      url: SITE_AUTHOR.url,
    },
    applicationCategory: "UtilitiesApplication",
    applicationSubCategory: "Encrypted clipboard sharing",
    operatingSystem: "Any (modern web browser)",
    browserRequirements: "Requires JavaScript. Requires HTML5.",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: SITE_FEATURES,
  };
}
