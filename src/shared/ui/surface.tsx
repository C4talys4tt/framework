import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

/** The standard elevated panel. */
export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line-subtle bg-surface shadow-raised", className)} {...props} />;
}
