import type { Ref, TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-sm border border-line bg-canvas px-3 py-2 text-sm leading-relaxed text-fg",
        "placeholder:text-fg-faint transition-[border-color,box-shadow] duration-150",
        "hover:border-line-strong focus-visible:border-accent-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
        "read-only:bg-surface read-only:text-fg-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger/60",
        className,
      )}
      {...props}
    />
  );
}
