import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGES } from "@/lib/pages";
import { SITE_URL } from "@/lib/site";
import sitemap from "./sitemap";

const APP_DIR = join(process.cwd(), "src", "app");

/**
 * Every route that `next build` will emit as a page, derived from the
 * filesystem: each `page.tsx` under src/app, mapped to its trailing-slash URL.
 * Route groups `(name)` don't add a segment; `_private` folders aren't routes.
 */
function appRoutes(dir = APP_DIR): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    routes.push(...appRoutes(join(dir, entry.name)));
  }
  if (existsSync(join(dir, "page.tsx"))) {
    const segments = relative(APP_DIR, dir)
      .split(sep)
      .filter((s) => s !== "" && !/^\(.*\)$/.test(s));
    routes.push(segments.length ? `/${segments.join("/")}/` : "/");
  }
  return routes.sort();
}

describe("sitemap", () => {
  const urls = sitemap().map((entry) => entry.url);

  it("lists every registered page with trailing-slash canonical URLs", () => {
    expect(urls).toEqual(PAGES.map((p) => `${SITE_URL}${p.path}`));
    for (const url of urls) expect(url.endsWith("/")).toBe(true);
  });

  it("only lists routes that exist as pages, and lists every page", () => {
    const sitemapRoutes = urls.map((url) => url.slice(SITE_URL.length)).sort();
    // Sanity: the scan must find the known pages, or the comparison is vacuous.
    expect(appRoutes()).toContain("/about/");
    expect(sitemapRoutes).toEqual(appRoutes());
  });

  it("keeps priorities within the sitemap protocol's 0–1 range", () => {
    for (const entry of sitemap()) {
      expect(entry.priority).toBeGreaterThanOrEqual(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });
});
