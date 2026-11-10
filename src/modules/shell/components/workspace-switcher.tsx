"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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

export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspace, workspaces, openCreateWorkspace } = useShell();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Workspace: ${workspace.name}. Switch workspace`}
        className={cn(
          "flex h-10 w-full items-center gap-2.5 rounded-sm px-1.5 text-left transition-colors duration-150 hover:bg-hover data-[state=open]:bg-hover",
          collapsed && "justify-center px-0",
        )}
      >
        <Avatar name={workspace.name} shape="square" className="size-7 text-[0.6875rem]" />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-semibold leading-tight text-fg">{workspace.name}</span>
              <span className="block text-[0.6875rem] capitalize leading-tight text-fg-faint">{workspace.role}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-fg-faint" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => {
              if (item.id !== workspace.id) router.push(workspacePath(item.slug, "overview"));
            }}
          >
            <Avatar name={item.name} shape="square" className="size-5 text-[0.5625rem]" />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.id === workspace.id ? <Check aria-label="Current workspace" className="!text-accent" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openCreateWorkspace}>
          <Plus aria-hidden />
          New workspace…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
