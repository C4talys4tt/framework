"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";
import { Tooltip } from "@/shared/ui/tooltip";
import { unavailableLabel, type ModuleDefinition } from "../navigation";

const rowClass =
  "group relative flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-[0.8125rem] font-medium transition-colors duration-150";

export function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  indicatorId,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  /** Shared layout id so the active marker glides between items. */
  indicatorId: string;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(rowClass, active ? "text-fg" : "text-fg-muted hover:bg-hover hover:text-fg", collapsed && "justify-center px-0")}
    >
      {active ? (
        <motion.span
          layoutId={indicatorId}
          aria-hidden
          className="absolute inset-0 rounded-sm bg-active"
          transition={{ type: "spring", stiffness: 520, damping: 42 }}
        />
      ) : null}
      <Icon aria-hidden className={cn("relative size-4 shrink-0", active ? "text-accent" : "text-fg-faint group-hover:text-fg-muted")} />
      {collapsed ? null : <span className="relative truncate">{label}</span>}
    </Link>
  );
  return collapsed ? <Tooltip content={label}>{link}</Tooltip> : link;
}

/**
 * A module that exists on the roadmap but has not shipped. It is deliberately
 * not a link: it stays focusable so its explanation is reachable by keyboard,
 * but activating it does nothing.
 */
export function UnavailableNavItem({ module, collapsed }: { module: ModuleDefinition; collapsed: boolean }) {
  const Icon = module.icon;
  return (
    <Tooltip content={unavailableLabel(module)}>
      <span
        role="link"
        aria-disabled="true"
        tabIndex={0}
        aria-label={unavailableLabel(module)}
        data-module={module.id}
        className={cn(rowClass, "cursor-not-allowed text-fg-faint", collapsed && "justify-center px-0")}
      >
        <Icon aria-hidden className="size-4 shrink-0 opacity-60" />
        {collapsed ? null : (
          <>
            <span className="truncate opacity-80">{module.label}</span>
            <Badge className="ml-auto">{module.milestone ?? "Later"}</Badge>
          </>
        )}
      </span>
    </Tooltip>
  );
}
