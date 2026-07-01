import { Lock } from "lucide-react";

/**
 * The always-visible end-to-end-encryption badge. States the guarantee plainly:
 * the password never leaves the browser.
 */
export function E2EBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-500">
      <Lock className="size-3.5 shrink-0" />
      🔒 End-to-end encrypted — your password never leaves this browser
    </span>
  );
}
