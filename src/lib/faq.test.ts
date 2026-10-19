import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FaqSection } from "@/components/faq-section";
import { FAQ, faqPageJsonLd } from "./faq";
import { SITE_URL } from "./site";

/** Undo React's HTML text escaping so rendered text compares to plain strings. */
function decodeHtml(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function textOf(html: string, tag: "h3" | "p"): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  return [...html.matchAll(re)].map((m) => decodeHtml(m[1] ?? ""));
}

interface JsonLdQuestion {
  "@type": string;
  name: string;
  acceptedAnswer: { "@type": string; text: string };
}

describe("FAQ", () => {
  it("has 8–10 non-empty, unique questions", () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(8);
    expect(FAQ.length).toBeLessThanOrEqual(10);
    expect(new Set(FAQ.map((e) => e.question)).size).toBe(FAQ.length);
    for (const entry of FAQ) {
      expect(entry.question.endsWith("?"), entry.question).toBe(true);
      expect(entry.answer.length, entry.question).toBeGreaterThan(40);
    }
  });
});

describe("faqPageJsonLd", () => {
  const data = faqPageJsonLd();
  const questions = data.mainEntity as JsonLdQuestion[];

  it("is a schema.org FAQPage for the absolute homepage URL", () => {
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("FAQPage");
    expect(data.url).toBe(`${SITE_URL}/`);
    for (const q of questions) {
      expect(q["@type"]).toBe("Question");
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
    }
  });

  it("matches the rendered FAQ entries exactly, in order", () => {
    const html = renderToStaticMarkup(createElement(FaqSection));
    const rendered = textOf(html, "h3").map((question, i) => ({
      question,
      answer: textOf(html, "p")[i],
    }));
    const structured = questions.map((q) => ({
      question: q.name,
      answer: q.acceptedAnswer.text,
    }));
    expect(rendered.length).toBe(FAQ.length);
    expect(structured).toEqual(rendered);
  });
});
