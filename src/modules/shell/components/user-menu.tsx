"use client";

import { useRouter } from "next/navigation";
import { LogOut, Monitor, Moon, Palette, Sun, UserRound } from "lucide-react";
import { usePreferences } from "@/modules/preferences/components/preferences-provider";
import type { Theme } from "@/modules/preferences/domain/appearance";
import { cn } from "@/shared/lib/cn";
import { Avatar } from "@/shared/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { workspacePath } from "../navigation";
import { useShell } from "../shell-context";

const NEXT_THEME: Record<Theme, Theme> = { dark: "light", light: "system", system: "dark" };
const THEME_LABEL: Record<Theme, string> = { dark: "Dark", light: "Light", system: "System" };
const THEME_ICON = { dark: Moon, light: Sun, system: Monitor } as const;

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user, workspace, signOut } = useShell();
  const { appearance, setAppearance } = usePreferences();
  const router = useRouter();
  const ThemeIcon = THEME_ICON[appearance.theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${user.name}`}
        className={cn(
          "flex h-10 w-full items-center gap-2.5 rounded-sm px-1.5 text-left transition-colors duration-150 hover:bg-hover data-[state=open]:bg-hover",
          collapsed && "justify-center px-0",
        )}
      >
        <Avatar name={user.name} className="size-7 text-[0.6875rem]" />
        {collapsed ? null : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-medium leading-tight text-fg">{user.name}</span>
            <span className="block truncate text-[0.6875rem] leading-tight text-fg-faint">{user.email}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block truncate text-[0.8125rem] font-medium text-fg">{user.name}</span>
          <span className="block truncate text-xs font-normal text-fg-faint">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(workspacePath(workspace.slug, "settings", "profile"))}>
          <UserRound aria-hidden />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(workspacePath(workspace.slug, "settings", "appearance"))}>
          <Palette aria-hidden />
          Appearance
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setAppearance({ theme: NEXT_THEME[appearance.theme] });
          }}
        >
          <ThemeIcon aria-hidden />
          <span className="flex-1">Theme</span>
          <span className="text-xs text-fg-faint">{THEME_LABEL[appearance.theme]}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
