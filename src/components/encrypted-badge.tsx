import { Lock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared header-pill styling. Both the encrypted badge and the About link wear
 * the same rounded, bordered pill, so the classes live here to keep them in
 * visual parity by construction rather than by copy-paste.
 */
// `bg-muted` (a step darker than the header's `bg-secondary`) keeps the pills
// distinct from the header bar, and matches the Advanced Settings panel so the
// raised surfaces share one shade. See docs/STYLE_MIGRATION.md.
export const HEADER_PILL_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent";

/**
 * The privacy promise, made visible. Links to /privacy where the guarantee is
 * explained (and verifiable via the browser Network tab).
 */
export function EncryptedBadge({ className }: { className?: string }) {
  return (
    <Link
      href="/privacy"
      aria-label="100% encrypted — your password never leaves this browser"
      title="100% encrypted — your password never leaves this browser"
      className={cn(HEADER_PILL_CLASS, className)}
    >
      <Lock className="size-3.5 shrink-0" />
      {/* Text from md up, icon-only on phones so the header fits without
          wrapping. */}
      <span className="hidden whitespace-nowrap md:inline">100% encrypted</span>
    </Link>
  );
}
