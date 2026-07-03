import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * `/robots.txt`. Generated as a static file by `next build` under
 * `output: "export"`. The app is a public tool — allow all crawlers and point
 * them at the sitemap.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
