import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isIndexableDeploy,
  OG_IMAGE,
  REPO_URL,
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  SITE_FEATURES,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_PUBLISHED,
  SITE_TITLE,
  SITE_URL,
  webApplicationJsonLd,
} from "./site";

describe("site identity", () => {
  it("uses an absolute https origin with no trailing slash", () => {
    expect(SITE_URL).toMatch(/^https:\/\//);
    expect(SITE_URL.endsWith("/")).toBe(false);
  });

  it("leads the homepage title with the brand and stays snippet-length", () => {
    expect(SITE_TITLE.startsWith(SITE_NAME)).toBe(true);
    // Google truncates titles around ~60 chars; keep the whole title visible.
    expect(SITE_TITLE.length).toBeLessThanOrEqual(60);
  });

  it("keeps the meta description within a healthy snippet length", () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThanOrEqual(70);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(320);
  });

  it("points the social preview image at a root-relative large card", () => {
    // Root-relative so Next resolves it against `metadataBase`.
    expect(OG_IMAGE.url.startsWith("/")).toBe(true);
    // The 1.91:1 size `summary_large_image` / Open Graph render full-width.
    expect(OG_IMAGE.width).toBe(1200);
    expect(OG_IMAGE.height).toBe(630);
    expect(OG_IMAGE.alt.startsWith(SITE_NAME)).toBe(true);
  });

  it("ships the social preview image in public/ at its declared size", () => {
    const file = join(process.cwd(), "public", OG_IMAGE.url);
    expect(existsSync(file)).toBe(true);
    const png = readFileSync(file);
    // PNG signature, then the IHDR chunk: width/height are big-endian u32s
    // at byte offsets 16 and 20.
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(OG_IMAGE.width);
    expect(png.readUInt32BE(20)).toBe(OG_IMAGE.height);
  });

  it("links the public source repository over https", () => {
    expect(REPO_URL).toMatch(/^https:\/\/github\.com\//);
  });

  it("targets the intended long-tail search phrases", () => {
    for (const kw of ["clipboard share", "text share"]) {
      expect(SITE_KEYWORDS).toContain(kw);
    }
    // No duplicate keywords.
    expect(new Set(SITE_KEYWORDS).size).toBe(SITE_KEYWORDS.length);
  });
});

describe("isIndexableDeploy", () => {
  it("indexes only the production (main) build", () => {
    expect(isIndexableDeploy("main")).toBe(true);
  });

  it("keeps staging, feature, and local builds out of search engines", () => {
    expect(isIndexableDeploy("develop")).toBe(false);
    expect(isIndexableDeploy("feature/some-branch")).toBe(false);
    // Local builds have no GITHUB_REF_NAME at all.
    expect(isIndexableDeploy(undefined)).toBe(false);
  });
});

describe("webApplicationJsonLd", () => {
  const data = webApplicationJsonLd();

  it("is a valid schema.org WebApplication with absolute URLs", () => {
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("WebApplication");
    expect(data.url).toBe(`${SITE_URL}/`);
    expect(data.name).toBe(SITE_NAME);
    // Crawlers do not resolve relative paths in structured data.
    expect(data.image).toBe(`${SITE_URL}${OG_IMAGE.url}`);
  });

  it("names its author, language, publish date and subcategory", () => {
    expect(data.author).toEqual({
      "@type": "Person",
      name: SITE_AUTHOR.name,
      url: SITE_AUTHOR.url,
    });
    expect(SITE_AUTHOR.url).toMatch(/^https:\/\//);
    expect(data.inLanguage).toBe("en");
    expect(data.datePublished).toBe(SITE_PUBLISHED);
    // ISO 8601 date (schema.org Date).
    expect(SITE_PUBLISHED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof data.applicationSubCategory).toBe("string");
  });

  it("never claims ratings or reviews it does not have", () => {
    expect(data).not.toHaveProperty("aggregateRating");
    expect(data).not.toHaveProperty("review");
  });

  it("advertises a free, JSON-serializable offer and feature list", () => {
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.featureList).toEqual(SITE_FEATURES);
    // Must survive JSON.stringify for the inline <script> in layout.tsx.
    expect(() => JSON.stringify(data)).not.toThrow();
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
