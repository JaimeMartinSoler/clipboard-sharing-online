import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * `/manifest.webmanifest`. Generated as a static file by `next build` under
 * `output: "export"`. Gives the app an installable identity (name, colors,
 * icon) and a richer share/appearance surface. The icon is the brand raster
 * from `public/` (slash + clipboard + padlock); browser-tab favicons are
 * declared separately in the root layout's `metadata.icons`.
 */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: "Clipboard",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#16a34a",
    icons: [
      {
        src: "/icon.png",
        type: "image/png",
        sizes: "256x256",
        purpose: "any",
      },
    ],
  };
}
