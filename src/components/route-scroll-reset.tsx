"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

/**
 * Starts every page at the very top. Pages scroll inside `<main>` (layout.tsx),
 * not the document, so Next's navigation scroll — a `scrollIntoView()` on the
 * new page's first element, run only when that element starts off-screen —
 * would leave `<main>` scrolled to just past its top padding. Runs as a layout
 * effect after Next's (it's rendered after the page), so it wins before paint.
 */
export function RouteScrollReset() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}
