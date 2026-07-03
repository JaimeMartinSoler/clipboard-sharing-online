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
export const SITE_TAGLINE = "Share Text Between Devices, Encrypted";

/**
 * The homepage `<title>`. Kept under ~60 chars so Google doesn't truncate it,
 * while leading with the two highest-intent phrases ("clipboard", "share text
 * between devices").
 */
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;

/**
 * The meta description / OpenGraph description. Written for a search snippet:
 * it names the concrete devices people search for (phone, PC, laptop, tablet)
 * and states the privacy guarantee that differentiates this tool.
 */
export const SITE_DESCRIPTION =
  "Free online clipboard to instantly share text between your phone, PC, " +
  "laptop and tablet. End-to-end encrypted — two devices meet on a single " +
  "password and the server only ever stores ciphertext it cannot read.";

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
    applicationCategory: "UtilitiesApplication",
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
