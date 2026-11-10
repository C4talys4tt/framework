import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="grid size-10 place-items-center rounded-md border border-line bg-raised text-fg-muted">{icon}</div>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="text-[0.8125rem] leading-relaxed text-fg-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
