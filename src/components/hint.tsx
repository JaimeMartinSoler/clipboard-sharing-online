"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Wraps a control with an always-on hover tooltip describing what it does.
 * The trigger is a wrapping span so the tooltip still appears when the inner
 * control is disabled (a disabled control has `pointer-events-none` and would
 * never receive hover itself).
 */
export function Hint({
  text,
  children,
  className,
}: {
  text: string;
  children: ReactNode;
  /** Extra classes for the wrapping trigger span (e.g. `flex-1` to stretch). */
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", className)}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
