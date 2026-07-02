import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Class applied to the wrapper — use `w-full` to stretch the control. */
  containerClassName?: string;
}

/**
 * A native <select> styled to match the rest of the toolbar. Native is a
 * deliberate choice: it scales to many options, is fully keyboard/AT
 * accessible, and adds no JS — fitting this client-only app.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, children, ...props }, ref) => (
    <div className={cn("relative inline-flex", containerClassName)}>
      <select
        ref={ref}
        className={cn(
          "h-8 appearance-none rounded-md border border-input bg-background py-1 pl-3 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
