import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site";
import sitemap from "./sitemap";

describe("sitemap", () => {
  const urls = sitemap().map((entry) => entry.url);

  it("lists every indexable route with trailing-slash canonical URLs", () => {
    expect(urls).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/privacy/`,
      `${SITE_URL}/about/`,
    ]);
  });

  it("keeps priorities within the sitemap protocol's 0–1 range", () => {
    for (const entry of sitemap()) {
      expect(entry.priority).toBeGreaterThanOrEqual(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });
});
