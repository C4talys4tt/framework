import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/shared/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-sm border border-line bg-canvas px-3 text-sm text-fg",
        "placeholder:text-fg-faint transition-[border-color,box-shadow] duration-150",
        "hover:border-line-strong focus-visible:border-accent-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
        "read-only:bg-surface read-only:text-fg-muted disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger/60",
        className,
      )}
      {...props}
    />
  );
}
