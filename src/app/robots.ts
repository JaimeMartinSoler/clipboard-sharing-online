import type { MetadataRoute } from "next";
import { SITE_INDEXABLE, SITE_URL } from "@/lib/site";

/**
 * `/robots.txt`. Generated as a static file by `next build` under
 * `output: "export"`. Production is a public tool — allow all crawlers and
 * point them at the sitemap. Non-production builds (the develop staging slot,
 * local builds) block everything so staging never competes with the canonical
 * origin in search results.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  if (!SITE_INDEXABLE) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
