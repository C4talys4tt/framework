"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, Menu, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { describeLocation } from "../navigation";
import { useShell } from "../shell-context";

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { workspace, openCommandPalette } = useShell();
  const location = describeLocation(usePathname());

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle px-3 md:px-5">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={onOpenMobileNav}>
        <Menu aria-hidden className="size-4" />
      </Button>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-[0.8125rem]">
          <li className="hidden truncate text-fg-faint sm:block">{workspace.name}</li>
          {location.map((label, index) => (
            <li key={label} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight aria-hidden className={index === 0 ? "hidden size-3 text-fg-faint sm:block" : "size-3 text-fg-faint"} />
              <span
                aria-current={index === location.length - 1 ? "page" : undefined}
                className={index === location.length - 1 ? "truncate font-medium text-fg" : "truncate text-fg-faint"}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
      </nav>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search and commands" onClick={openCommandPalette}>
        <Search aria-hidden className="size-4" />
      </Button>
    </header>
  );
}
