"use client";

import { useId } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Search, Settings } from "lucide-react";
import { usePreferences } from "@/modules/preferences/components/preferences-provider";
import { cn } from "@/shared/lib/cn";
import { Kbd } from "@/shared/ui/kbd";
import { Tooltip } from "@/shared/ui/tooltip";
import { MODULES, isAvailable, workspacePath } from "../navigation";
import { useShell } from "../shell-context";
import { NavLink, UnavailableNavItem } from "./nav-item";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * Sidebar contents. Rendered inside the fixed desktop rail and inside the
 * mobile drawer, so it takes its collapsed state as a prop.
 */
export function SidebarContent({
  collapsed,
  onNavigate,
  showCollapseToggle,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  showCollapseToggle: boolean;
}) {
  const { workspace, openCommandPalette } = useShell();
  const { toggleSidebar } = usePreferences();
  const pathname = usePathname();
  const indicatorId = useId();
  const settingsHref = workspacePath(workspace.slug, "settings");
  const available = MODULES.filter(isAvailable);
  const planned = MODULES.filter((module) => !isAvailable(module));
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  const searchButton = (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search and commands"
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-sm border border-line-subtle bg-canvas px-2 text-[0.8125rem] text-fg-faint transition-colors duration-150 hover:border-line hover:text-fg-muted",
        collapsed && "justify-center px-0",
      )}
    >
      <Search aria-hidden className="size-3.5 shrink-0" />
      {collapsed ? null : (
        <>
          <span className="flex-1 text-left">Search</span>
          <Kbd aria-hidden>⌘K</Kbd>
        </>
      )}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      <div className="px-2 pb-2">{collapsed ? <Tooltip content="Search and commands">{searchButton}</Tooltip> : searchButton}</div>

      <nav aria-label="Workspace" className="flex-1 overflow-y-auto px-2 pb-2">
        <ul className="flex flex-col gap-px">
          {available.map((module) => {
            const href = workspacePath(workspace.slug, module.segment);
            return (
              <li key={module.id}>
                <NavLink
                  href={href}
                  label={module.label}
                  icon={module.icon}
                  active={pathname === href || pathname.startsWith(`${href}/`)}
                  collapsed={collapsed}
                  indicatorId={indicatorId}
                  onNavigate={onNavigate}
                />
              </li>
            );
          })}
        </ul>

        <div className="mb-1 mt-5 flex h-5 items-center px-2">
          {collapsed ? (
            <span aria-hidden className="h-px w-full bg-line-subtle" />
          ) : (
            <h2 className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-fg-faint">Coming to the studio</h2>
          )}
        </div>
        <ul className="flex flex-col gap-px" aria-label="Modules that are not available yet">
          {planned.map((module) => (
            <li key={module.id}>
              <UnavailableNavItem module={module} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-px border-t border-line-subtle p-2">
        <NavLink
          href={workspacePath(workspace.slug, "settings", "profile")}
          label="Settings"
          icon={Settings}
          active={pathname.startsWith(settingsHref)}
          collapsed={collapsed}
          indicatorId={indicatorId}
          onNavigate={onNavigate}
        />
        {showCollapseToggle ? (
          <Tooltip
            content={
              <>
                {collapsed ? "Expand sidebar" : "Collapse sidebar"} <Kbd>⌘B</Kbd>
              </>
            }
          >
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-[0.8125rem] font-medium text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg",
                collapsed && "justify-center px-0",
              )}
            >
              <CollapseIcon aria-hidden className="size-4 shrink-0 text-fg-faint" />
              {collapsed ? null : <span>Collapse</span>}
            </button>
          </Tooltip>
        ) : null}
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}
