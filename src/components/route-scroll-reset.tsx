"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { resetRouteScroll } from "@/lib/route-scroll";

/**
 * Starts every page at the very top. Pages scroll inside `<main>` (layout.tsx),
 * not the document, so Next's navigation scroll — a `scrollIntoView()` on the
 * new page's first element, run only when that element starts off-screen —
 * would leave `<main>` scrolled to just past its top padding. Runs as a layout
 * effect after Next's (it's rendered after the page), so it wins before paint.
 * That ordering leans on a Next internal (its scroll handler scrolls
 * synchronously in `componentDidMount`/`DidUpdate`) — recheck this on Next
 * upgrades. Links with a `#fragment` are left where Next scrolled them.
 *
 * It also fires on Back/Forward, landing at the top rather than the previous
 * position. Not a regression: Next can't restore scroll on a custom `<main>`
 * scroller anyway. Restoration would need a `popstate`-aware guard here.
 */
export function RouteScrollReset() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    resetRouteScroll(window.location.hash, [
      document.querySelector("main"),
      window,
    ]);
  }, [pathname]);
  return null;
}
