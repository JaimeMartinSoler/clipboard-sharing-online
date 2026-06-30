import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The single, always-present status line under the toolbar. Showing exactly one
 * banner at all times reserves the row so the layout never jumps when a message
 * appears.
 *
 * Priority (decided by the caller): error > warning > info > validated.
 */
export type BannerKind = "info" | "validated" | "warning" | "error";

const STYLES: Record<BannerKind, { className: string; Icon: LucideIcon }> = {
  info: {
    className: "border-border bg-muted/50 text-muted-foreground",
    Icon: Info,
  },
  validated: {
    className:
      "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-500",
    Icon: CheckCircle2,
  },
  warning: {
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500",
    Icon: TriangleAlert,
  },
  error: {
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: AlertCircle,
  },
};

export function StatusBanner({
  kind,
  children,
}: {
  kind: BannerKind;
  children: ReactNode;
}) {
  const { className, Icon } = STYLES[kind];
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
