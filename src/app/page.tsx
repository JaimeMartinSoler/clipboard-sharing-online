import { ClipboardApp } from "@/components/clipboard-app";
import { LandingContent } from "@/components/landing-content";
import { faqPageJsonLd } from "@/lib/faq";
import { serializeJsonLd } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      {/* The app claims at least the whole first screen: `min-h-full` resolves
          against the fixed-height `<main>` scroll container (layout.tsx), so
          the landing content below always starts under the fold and the
          Create/Join entry view stays the only thing visible on load. */}
      <div className="min-h-full">
        <ClipboardApp />
      </div>
      <LandingContent />
      {/* FAQPage structured data, built from the same `FAQ` array the visible
          FAQ renders — never a second copy. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqPageJsonLd()) }}
      />
    </>
  );
}
