"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/cn";

export function ProjectTabs({ base, noteCount }: { base: string; noteCount: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/notes`, label: "Notes", count: noteCount },
    { href: `${base}/activity`, label: "Activity" },
  ];
  return (
    <nav aria-label="Project sections" className="overflow-x-auto border-b border-line-subtle">
      <ul className="-ml-3 flex gap-1 pl-px">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-1.5 rounded-t-sm px-3 text-[0.8125rem] font-medium transition-colors duration-150",
                  active ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {tab.label}
                {tab.count ? <span className="font-mono text-[0.6875rem] text-fg-faint">{tab.count}</span> : null}
                {active ? (
                  <motion.span
                    layoutId="project-tab-active"
                    aria-hidden
                    className="absolute inset-x-3 -bottom-px h-px bg-accent"
                    transition={{ type: "spring", stiffness: 520, damping: 42 }}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
