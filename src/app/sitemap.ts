import type { MetadataRoute } from "next";
import { PAGES, pageUrl } from "@/lib/pages";

/**
 * `/sitemap.xml`. Generated as a static file by `next build` under
 * `output: "export"`. Lists every indexable route from the `PAGES` registry
 * (src/lib/pages.ts) — the same list each page's metadata and the footer's
 * internal links come from, so the three can't drift. `trailingSlash: true` in
 * next.config.mjs means the canonical URLs end in a slash; the registry paths
 * match that so the sitemap agrees with the canonical tags.
 *
 * `lastModified` is intentionally omitted: with no build-time date source it
 * would either be a lie or churn on every deploy. Crawlers fall back to their
 * own recrawl heuristics, which is fine for a small static site.
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({
    url: pageUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
