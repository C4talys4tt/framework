"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { SETTINGS_SECTIONS, workspacePath } from "@/modules/shell/navigation";
import { useShell } from "@/modules/shell/shell-context";
import { cn } from "@/shared/lib/cn";

export function SettingsNav() {
  const { workspace } = useShell();
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="overflow-x-auto border-b border-line-subtle">
      <ul className="-ml-3 flex gap-1 pl-px">
        {SETTINGS_SECTIONS.map((section) => {
          const href = workspacePath(workspace.slug, "settings", section.id);
          const active = pathname === href;
          return (
            <li key={section.id}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center rounded-t-sm px-3 text-[0.8125rem] font-medium transition-colors duration-150",
                  active ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {section.label}
                {active ? (
                  <motion.span
                    layoutId="settings-nav-active"
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
