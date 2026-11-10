import { ChevronDown, ChevronUp, ChevronsUp } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { HUE_DOT, PRIORITY_LABEL, type Hue, type Priority } from "../domain/project";

export function HueDot({ hue, className }: { hue: Hue; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", HUE_DOT[hue], className)} />;
}

export function StatusBadge({ status, className }: { status: { name: string; color: Hue }; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 text-xs font-medium text-fg",
        className,
      )}
    >
      <HueDot hue={status.color} />
      <span className="truncate">{status.name}</span>
    </span>
  );
}

export function CategoryLabel({ category }: { category: { name: string; color: Hue } }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-fg-muted">
      <HueDot hue={category.color} />
      <span className="truncate">{category.name}</span>
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, { icon: typeof ChevronUp | null; className: string }> = {
  low: { icon: ChevronDown, className: "text-fg-faint" },
  normal: { icon: null, className: "text-fg-muted" },
  high: { icon: ChevronUp, className: "text-hue-amber" },
  urgent: { icon: ChevronsUp, className: "text-danger" },
};

/** Normal priority is the default and is left out of dense views unless `showNormal`. */
export function PriorityLabel({ priority, showNormal = false }: { priority: Priority; showNormal?: boolean }) {
  if (priority === "normal" && !showNormal) return null;
  const { icon: Icon, className } = PRIORITY_STYLE[priority];
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
      {PRIORITY_LABEL[priority]}
      <span className="sr-only"> priority</span>
    </span>
  );
}
