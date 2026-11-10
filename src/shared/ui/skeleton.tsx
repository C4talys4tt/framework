import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

/** A placeholder block for content that is still streaming in. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-shimmer rounded-sm bg-active", className)} {...props} />;
}
