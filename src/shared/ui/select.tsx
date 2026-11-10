import type { Ref, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

/** A native select (so keyboard, mobile pickers and screen readers just work) in the house style. */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <span className="relative inline-flex w-full">
      <select
        className={cn(
          "h-9 w-full appearance-none rounded-sm border border-line bg-canvas pl-3 pr-8 text-sm text-fg",
          "transition-[border-color,box-shadow] duration-150",
          "hover:border-line-strong focus-visible:border-accent-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger/60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
    </span>
  );
}
