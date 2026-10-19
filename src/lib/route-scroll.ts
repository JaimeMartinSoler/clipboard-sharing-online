/**
 * The decision behind `RouteScrollReset`, kept free of React and the DOM so it
 * is unit-testable: after a route change, scroll every target to the top —
 * unless the URL carries a fragment, in which case Next has just scrolled the
 * fragment's element into view and resetting would undo it.
 */

/** The slice of `Element`/`window` we need, so this is testable without a DOM. */
export interface ScrollTarget {
  scrollTo: (options: ScrollToOptions) => void;
}

/** Scrolls each present target to `top: 0`; returns whether it did. */
export function resetRouteScroll(
  hash: string,
  targets: readonly (ScrollTarget | null | undefined)[],
): boolean {
  if (hash !== "" && hash !== "#") return false;
  for (const target of targets) target?.scrollTo({ top: 0 });
  return true;
}
