import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Height-animated disclosure — content slides open/closed instead of "popping".
 *
 * Uses the dependency-free CSS grid trick: a single-row grid animated between
 * `grid-rows-[0fr]` (collapsed) and `grid-rows-[1fr]` (expanded). Because `fr`
 * tracks are animatable, the height eases without any JS measurement, and the
 * inner `overflow-hidden` track clips the content while it's mid-collapse. A
 * matching opacity fade softens the reveal.
 *
 * Children stay mounted so the open/close can animate, so when collapsed the
 * subtree is marked `inert` (not focusable, not read by AT) and `aria-hidden`.
 * Users who prefer reduced motion get an instant toggle (`motion-reduce`).
 *
 * Consumer `className` (borders, padding) lands on an inner wrapper, never on
 * the `overflow-hidden` clip track: padding/border on a `0fr` grid row can't
 * shrink below its own box, so putting them on the track would leave a residual
 * height strip when collapsed. Keeping the track box-free lets it collapse to 0.
 */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  /** Ties the panel to its trigger's `aria-controls`. */
  id?: string;
  /** Extra classes on the content wrapper inside the clip track (e.g. borders, padding). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      // `inert` keeps collapsed form controls out of the tab order (React 19).
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div
        className={cn(
          "min-h-0 overflow-hidden transition-opacity duration-200 ease-out motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
