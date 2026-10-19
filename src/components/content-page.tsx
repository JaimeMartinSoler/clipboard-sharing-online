import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the static content pages (the landing pages and the
 * homepage's below-the-app content). Same panel aesthetic as /privacy: a
 * centered icon + H1, then `bg-card` bordered sections with an H2 each.
 */

/** Inline text link inside body copy. */
export const TEXT_LINK_CLASS =
  "font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground";

export function ContentPage({
  icon: Icon,
  title,
  lead,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-center gap-3">
        <Icon className="size-6 shrink-0" />
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          {title}
        </h1>
      </div>
      <p className="text-center text-muted-foreground">{lead}</p>
      <div className="space-y-3">{children}</div>
    </article>
  );
}

export function ContentSection({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("space-y-2 rounded-lg border bg-card p-4 md:p-6", className)}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {Icon && <Icon className="size-4 shrink-0" />}
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** The call to action back to the tool at `/`, placed inside a section. */
export function OpenClipboardButton() {
  return (
    <Link href="/" className={buttonVariants({ size: "lg" })}>
      Open the clipboard
      <ArrowRight className="size-4" />
    </Link>
  );
}
