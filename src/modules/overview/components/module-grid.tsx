import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MODULES, isAvailable, unavailableLabel, workspacePath } from "@/modules/shell/navigation";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";

const cardClass = "relative flex min-h-32 flex-col gap-3 rounded-lg border p-4";

export function ModuleGrid({ workspaceSlug }: { workspaceSlug: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {MODULES.map((module) => {
        const Icon = module.icon;
        const body = (
          <>
            <div className="flex items-center justify-between">
              <Icon aria-hidden className={cn("size-4", isAvailable(module) ? "text-accent" : "text-fg-faint")} />
              {isAvailable(module) ? <Badge tone="accent">Live</Badge> : <Badge>{module.milestone ?? "Later"}</Badge>}
            </div>
            <div className="flex flex-col gap-1">
              <p className={cn("text-sm font-medium", isAvailable(module) ? "text-fg" : "text-fg-muted")}>{module.label}</p>
              <p className="text-xs leading-relaxed text-fg-faint">{module.description}</p>
            </div>
          </>
        );

        return (
          <li key={module.id}>
            {isAvailable(module) ? (
              <Link
                href={workspacePath(workspaceSlug, module.segment)}
                className={cn(
                  cardClass,
                  "group border-line bg-surface shadow-raised transition-colors duration-150 hover:border-accent-line hover:bg-raised",
                )}
              >
                {body}
                <ArrowUpRight
                  aria-hidden
                  className="absolute bottom-4 right-4 size-3.5 text-fg-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                />
              </Link>
            ) : (
              <div className={cn(cardClass, "border-dashed border-line-subtle")} aria-label={unavailableLabel(module)}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
