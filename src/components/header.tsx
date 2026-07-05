"use client";

import { Info, Lock } from "lucide-react";
import Link from "next/link";
import { EncryptedBadge } from "@/components/encrypted-badge";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  // Clicking the title/lock should return to the entry ("main") view. When we're
  // already on "/", the app is a single client view, so navigating there is a
  // no-op — instead dispatch an event ClipboardApp listens for to drop the room
  // session (routing through Back so history stays clean). From other routes
  // (e.g. /privacy) let the Link navigate to "/" normally.
  function handleHomeClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("cso:home"));
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Link
        href="/"
        onClick={handleHomeClick}
        className="flex min-w-0 items-center gap-2 font-semibold"
      >
        <Lock className="size-5 shrink-0" />
        <span className="truncate">Clipboard Sharing Online</span>
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <EncryptedBadge />
          <Link
            href="/about"
            aria-label="About"
            title="About"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
          >
            <Info className="size-3.5 shrink-0" />
            <span className="hidden whitespace-nowrap md:inline">About</span>
          </Link>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
