import { FAQ } from "@/lib/faq";

/**
 * The homepage FAQ, rendered straight from `FAQ` — the same data the page's
 * `FAQPage` JSON-LD is built from (faq.test.ts asserts they match). Every
 * answer is always visible, never behind a toggle, so the structured data only
 * ever describes content a reader can see.
 *
 * Deliberately free of Next-only imports so the test can render it with
 * `react-dom/server`.
 */
export function FaqSection() {
  return (
    <section aria-labelledby="faq-heading" className="space-y-3">
      <h2
        id="faq-heading"
        className="text-center text-xl font-semibold tracking-tight"
      >
        Frequently asked questions
      </h2>
      {FAQ.map((entry) => (
        <div
          key={entry.question}
          className="space-y-1.5 rounded-lg border bg-card p-4"
        >
          <h3 className="font-medium">{entry.question}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {entry.answer}
          </p>
        </div>
      ))}
    </section>
  );
}
