"use client";

import { ExternalLink, LockKeyhole, X } from "lucide-react";
import { TEXT_LINK_CLASS } from "@/components/content-page";
import { getPage } from "@/lib/pages";

/** Where "How it works" points: the step-by-step phone ⇄ PC walkthrough. */
const HOW_IT_WORKS_PATH = getPage("/share-text-between-phone-and-pc/").path;

/**
 * A one-line, dismissible "what is this site" note for a first-time visitor
 * who arrived through a share link — they were auto-joined straight into a
 * room and never saw the homepage. Never blocks or delays the join: it renders
 * inside the room view, above the editor.
 *
 * The link opens in a new tab on purpose: navigating this tab away would drop
 * the in-memory membership token and forfeit the visitor's slot.
 */
export function FirstVisitExplainer({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
    >
      <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        New here? This site shares text between your devices,{" "}
        <strong className="text-foreground">end-to-end encrypted</strong> in
        the browser.{" "}
        <a
          href={HOW_IT_WORKS_PATH}
          target="_blank"
          rel="noopener"
          className={`${TEXT_LINK_CLASS} inline-flex items-center gap-1 whitespace-nowrap`}
        >
          How it works
          <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="mt-0.5 shrink-0 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
