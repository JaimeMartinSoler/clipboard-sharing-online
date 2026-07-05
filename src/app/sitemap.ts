import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * `/sitemap.xml`. Generated as a static file by `next build` under
 * `output: "export"`. Two indexable routes: the app itself and the privacy
 * page. `trailingSlash: true` in next.config.mjs means the canonical URLs end
 * in a slash — match that here so the sitemap agrees with the canonical tags.
 *
 * `lastModified` is intentionally omitted: with no build-time date source it
 * would either be a lie or churn on every deploy. Crawlers fall back to their
 * own recrawl heuristics, which is fine for a two-page site.
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy/`,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
