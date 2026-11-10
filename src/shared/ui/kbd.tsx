import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-raised px-1 font-mono text-[0.6875rem] font-medium text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
