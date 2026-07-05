import { describe, expect, it } from "vitest";
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_FEATURES,
  SITE_KEYWORDS,
  SITE_NAME,
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
    // Google truncates titles well past this; keep it comfortably short.
    expect(SITE_TITLE.length).toBeLessThanOrEqual(65);
  });

  it("keeps the meta description within a healthy snippet length", () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThanOrEqual(70);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(320);
  });

  it("points the social preview image at a root-relative square asset", () => {
    // Root-relative so Next resolves it against `metadataBase`.
    expect(OG_IMAGE.url.startsWith("/")).toBe(true);
    expect(OG_IMAGE.width).toBe(OG_IMAGE.height);
    expect(OG_IMAGE.alt).toBe(SITE_NAME);
  });

  it("targets the intended long-tail search phrases", () => {
    for (const kw of ["clipboard share", "text share"]) {
      expect(SITE_KEYWORDS).toContain(kw);
    }
    // No duplicate keywords.
    expect(new Set(SITE_KEYWORDS).size).toBe(SITE_KEYWORDS.length);
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

  it("advertises a free, JSON-serializable offer and feature list", () => {
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.featureList).toEqual(SITE_FEATURES);
    // Must survive JSON.stringify for the inline <script> in layout.tsx.
    expect(() => JSON.stringify(data)).not.toThrow();
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
