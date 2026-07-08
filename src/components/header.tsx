"use client";

import { Info } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EncryptedBadge, HEADER_PILL_CLASS } from "@/components/encrypted-badge";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  // Clicking the title/logo should return to the entry ("main") view. When we're
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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-secondary px-4">
      <Link
        href="/"
        onClick={handleHomeClick}
        className="flex min-w-0 items-center gap-2.5 font-semibold"
      >
        <Image
          src="/logo.png"
          alt=""
          width={28}
          height={28}
          className="size-7 shrink-0 dark:invert"
        />
        <span className="truncate leading-normal">Clipboard Sharing Online</span>
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <EncryptedBadge />
          <Link
            href="/about"
            aria-label="About"
            title="About"
            className={HEADER_PILL_CLASS}
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
