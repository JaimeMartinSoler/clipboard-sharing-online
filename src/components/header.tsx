"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
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
        <Link
          href="/privacy"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Privacy
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
