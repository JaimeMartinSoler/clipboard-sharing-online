/**
 * Registry of every indexable route: its canonical path, final `<title>`, meta
 * description, and sitemap hints.
 *
 * Single source of truth for the sitemap, each page's `metadata`, and the site
 * footer's internal links — so a page can't exist without a sitemap entry (and
 * vice versa), and titles/descriptions stay unique and snippet-length. The
 * guarantees are enforced by `pages.test.ts`.
 */
import type { Metadata, MetadataRoute } from "next";
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "./site";

export interface SitePage {
  /** Canonical path, with the trailing slash `trailingSlash: true` emits. */
  path: `/${string}`;
  /** The complete `<title>` as rendered (no layout template applied). */
  title: string;
  /** Meta / Open Graph description. */
  description: string;
  /** Short label for internal-link blocks (footer). */
  navLabel: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
}

/** Google truncates titles around ~60 chars and descriptions around ~160. */
export const MAX_TITLE_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 160;

export const PAGES = [
  {
    path: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    navLabel: "Home",
    changeFrequency: "monthly",
    priority: 1,
  },
  {
    path: "/share-text-between-phone-and-pc/",
    title: "Share Text Between Phone and PC — Encrypted, No App",
    description:
      "Send a link, code or note from your phone to your PC (or back) in seconds. Nothing to install, no account, end-to-end encrypted in the browser.",
    navLabel: "Phone to PC",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/privacy/",
    title: "Privacy · Clipboard Sharing Online",
    description:
      "How your data stays private: encryption in the browser, a zero-knowledge server, rooms that seal when full, short-lived storage and no cookies.",
    navLabel: "Privacy",
    changeFrequency: "yearly",
    priority: 0.5,
  },
  {
    path: "/security/",
    title: "Security & Threat Model · Clipboard Sharing Online",
    description:
      "Threat model and cryptography: Argon2id, HKDF, AES-GCM-256, what the server and a database thief can see, and the known limits of a password-only design.",
    navLabel: "Security",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/about/",
    title: "About · Clipboard Sharing Online",
    description:
      "About Clipboard Sharing Online — built by Jaime Martín Soler. View the source on GitHub.",
    navLabel: "About",
    changeFrequency: "yearly",
    priority: 0.4,
  },
] as const satisfies readonly SitePage[];

export type PagePath = (typeof PAGES)[number]["path"];

/** Look up a registered page. Typed so an unregistered path fails to compile. */
export function getPage(path: PagePath): SitePage {
  const page = PAGES.find((p) => p.path === path);
  // Unreachable: `PagePath` only admits registered paths.
  if (!page) throw new Error(`Unregistered page: ${path}`);
  return page;
}

/**
 * Page-level `metadata` for an inner route: absolute title (so the registry's
 * string is exactly what renders), description, canonical, and a complete Open
 * Graph / Twitter card. Next replaces — not merges — a layout's `openGraph`, so
 * the image is repeated here rather than silently dropped.
 */
export function pageMetadata(path: PagePath): Metadata {
  const page = getPage(path);
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: page.title,
      description: page.description,
      url: page.path,
      locale: "en_US",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [OG_IMAGE.url],
    },
  };
}

/** Absolute URL of a registered page, for the sitemap and structured data. */
export function pageUrl(path: PagePath): string {
  return `${SITE_URL}${path}`;
}
