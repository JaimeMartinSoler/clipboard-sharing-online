import { Lock } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold">
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
