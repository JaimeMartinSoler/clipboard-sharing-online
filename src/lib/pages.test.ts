import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPage,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  pageMetadata,
  PAGES,
  pageUrl,
} from "./pages";
import { OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "./site";

describe("PAGES registry", () => {
  it("gives every page a unique, snippet-length title", () => {
    const titles = PAGES.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) {
      expect(title.length, title).toBeGreaterThan(0);
      expect(title.length, title).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    }
  });

  it("gives every page a unique, snippet-length meta description", () => {
    const descriptions = PAGES.map((p) => p.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const description of descriptions) {
      expect(description.length, description).toBeGreaterThanOrEqual(70);
      expect(description.length, description).toBeLessThanOrEqual(
        MAX_DESCRIPTION_LENGTH,
      );
    }
  });

  it("uses unique trailing-slash paths and nav labels", () => {
    const paths = PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.endsWith("/")).toBe(true);
    const labels = PAGES.map((p) => p.navLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the homepage entry in sync with the root layout's metadata", () => {
    expect(getPage("/").title).toBe(SITE_TITLE);
    expect(getPage("/").description).toBe(SITE_DESCRIPTION);
  });

  it("keeps sitemap priorities within the protocol's 0–1 range", () => {
    for (const page of PAGES) {
      expect(page.priority).toBeGreaterThanOrEqual(0);
      expect(page.priority).toBeLessThanOrEqual(1);
    }
  });
});

describe("pageMetadata", () => {
  it("renders the registry title verbatim, with canonical and a full card", () => {
    const page = getPage("/security/");
    const meta = pageMetadata("/security/");
    // `absolute` bypasses the layout's `%s · Site` template, so the registry
    // string is exactly the rendered <title> the length test checks.
    expect(meta.title).toEqual({ absolute: page.title });
    expect(meta.description).toBe(page.description);
    expect(meta.alternates?.canonical).toBe(page.path);
    expect(meta.openGraph?.title).toBe(page.title);
    expect(meta.openGraph?.images).toEqual([OG_IMAGE]);
  });

  it("is what every inner page exports as its metadata", () => {
    // Guards against a page hand-writing a title/description that bypasses
    // the registry (and therefore the uniqueness/length checks above).
    for (const page of PAGES) {
      if (page.path === "/") continue; // root layout owns the homepage meta
      const file = join(process.cwd(), "src", "app", page.path, "page.tsx");
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(
        new RegExp(`pageMetadata\\(\\s*"${page.path}"\\s*,?\\s*\\)`),
      );
    }
  });
});

describe("pageUrl", () => {
  it("builds absolute canonical URLs", () => {
    expect(pageUrl("/")).toBe(`${SITE_URL}/`);
    expect(pageUrl("/security/")).toBe(`${SITE_URL}/security/`);
  });
});
