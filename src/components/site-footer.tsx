import Link from "next/link";
import { PAGES } from "@/lib/pages";

/**
 * Site-wide internal link block, rendered at the end of every page's scroll
 * area (inside `<main>`, after the page). Driven by the `PAGES` registry so every
 * indexable route is linked from every other one. On `/` it sits below the
 * landing content, so it never shows above the fold.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto mt-12 max-w-3xl border-t pt-6 text-sm text-muted-foreground">
      <nav aria-label="Site">
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {PAGES.map((page) => (
            <li key={page.path}>
              <Link
                href={page.path}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {page.navLabel}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-3 text-center text-xs">
        End-to-end encrypted in your browser. Open source, no accounts, no
        cookies.
      </p>
    </footer>
  );
}
