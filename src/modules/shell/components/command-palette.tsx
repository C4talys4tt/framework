"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  ArrowRight,
  Check,
  FolderPlus,
  LayoutPanelLeft,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Rows3,
  Search,
  Settings,
  Sun,
  Upload,
  Zap,
} from "lucide-react";
import { usePreferences } from "@/modules/preferences/components/preferences-provider";
import type { Theme } from "@/modules/preferences/domain/appearance";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { overlayClassName } from "@/shared/ui/dialog";
import { Kbd } from "@/shared/ui/kbd";
import { MODULES, SETTINGS_SECTIONS, isAvailable, workspacePath } from "../navigation";
import { useShell } from "../shell-context";

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

const itemClass =
  "flex h-9 cursor-pointer select-none items-center gap-3 rounded-sm px-2.5 text-[0.8125rem] text-fg " +
  "data-[selected=true]:bg-active data-[disabled=true]:cursor-not-allowed data-[disabled=true]:text-fg-faint " +
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted";

const groupClass =
  "px-1.5 pb-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 " +
  "[&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase " +
  "[&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-fg-faint";

const GO_TO_KEY: Record<string, string> = { overview: "O", projects: "P", library: "L" };

function Shortcut({ children }: { children: ReactNode }) {
  return <span className="ml-auto flex items-center gap-1">{children}</span>;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { workspace, workspaces, openCreateWorkspace, signOut } = useShell();
  const { appearance, setAppearance, toggleSidebar } = usePreferences();
  const router = useRouter();

  /** Close first so focus returns to the page before the command takes effect. */
  function run(command: () => void) {
    onOpenChange(false);
    command();
  }

  const go = (...segments: string[]) => run(() => router.push(workspacePath(workspace.slug, ...segments)));
  const otherWorkspaces = workspaces.filter((item) => item.id !== workspace.id);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      loop
      overlayClassName={overlayClassName}
      contentClassName="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-overlay shadow-overlay data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
    >
      <div className="flex h-12 items-center gap-3 border-b border-line-subtle px-4">
        <Search aria-hidden className="size-4 shrink-0 text-fg-faint" />
        <Command.Input
          placeholder="Search commands and destinations…"
          className="h-full flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
        />
        <Kbd aria-hidden>Esc</Kbd>
      </div>

      <Command.List className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain py-1.5">
        <Command.Empty className="px-4 py-10 text-center text-[0.8125rem] text-fg-muted">
          No commands match your search.
        </Command.Empty>

        <Command.Group heading="Go to" className={groupClass}>
          {MODULES.filter(isAvailable).map((module) => (
            <Command.Item key={module.id} value={`go ${module.label}`} onSelect={() => go(module.segment)} className={itemClass}>
              <module.icon aria-hidden />
              {module.label}
              {GO_TO_KEY[module.id] ? (
                <Shortcut>
                  <Kbd>G</Kbd>
                  <Kbd>{GO_TO_KEY[module.id]}</Kbd>
                </Shortcut>
              ) : null}
            </Command.Item>
          ))}
          {SETTINGS_SECTIONS.map((section) => (
            <Command.Item
              key={section.id}
              value={`go settings ${section.label}`}
              keywords={[section.description]}
              onSelect={() => go("settings", section.id)}
              className={itemClass}
            >
              <Settings aria-hidden />
              <span>
                Settings <span className="text-fg-faint">/</span> {section.label}
              </span>
              {section.id === "profile" ? (
                <Shortcut>
                  <Kbd>G</Kbd>
                  <Kbd>S</Kbd>
                </Shortcut>
              ) : null}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Create" className={groupClass}>
          <Command.Item
            value="new project create"
            keywords={["add", "start"]}
            onSelect={() => run(() => router.push(`${workspacePath(workspace.slug, "projects")}?new=1`))}
            className={itemClass}
          >
            <Plus aria-hidden />
            New project…
          </Command.Item>
          <Command.Item
            value="upload references images library"
            keywords={["add", "import", "visual"]}
            onSelect={() => run(() => router.push(`${workspacePath(workspace.slug, "library")}?upload=1`))}
            className={itemClass}
          >
            <Upload aria-hidden />
            Upload references…
          </Command.Item>
          <Command.Item
            value="new moodboard create board"
            keywords={["add", "canvas", "visual"]}
            onSelect={() => run(() => router.push(`${workspacePath(workspace.slug, "library", "moodboards")}?new=1`))}
            className={itemClass}
          >
            <LayoutPanelLeft aria-hidden />
            New moodboard…
          </Command.Item>
          <Command.Item
            value="new collection create"
            keywords={["add", "group", "visual"]}
            onSelect={() => run(() => router.push(`${workspacePath(workspace.slug, "library", "collections")}?new=1`))}
            className={itemClass}
          >
            <FolderPlus aria-hidden />
            New collection…
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Workspace" className={groupClass}>
          {otherWorkspaces.map((item) => (
            <Command.Item
              key={item.id}
              value={`switch workspace ${item.name} ${item.slug}`}
              onSelect={() => run(() => router.push(workspacePath(item.slug, "overview")))}
              className={itemClass}
            >
              <Avatar name={item.name} shape="square" className="size-4 text-[0.5rem]" />
              <span>
                Switch to <span className="font-medium">{item.name}</span>
              </span>
              <ArrowRight aria-hidden className="ml-auto" />
            </Command.Item>
          ))}
          <Command.Item value="new workspace create" onSelect={() => run(openCreateWorkspace)} className={itemClass}>
            <Plus aria-hidden />
            New workspace…
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Appearance" className={groupClass}>
          {THEME_OPTIONS.map((option) => (
            <Command.Item
              key={option.value}
              value={`theme ${option.label}`}
              keywords={["appearance", "color", "mode"]}
              onSelect={() => run(() => setAppearance({ theme: option.value }))}
              className={itemClass}
            >
              <option.icon aria-hidden />
              Theme: {option.label}
              {appearance.theme === option.value ? <Check aria-label="Current theme" className="ml-auto !text-accent" /> : null}
            </Command.Item>
          ))}
          <Command.Item
            value="density toggle compact comfortable"
            onSelect={() => run(() => setAppearance({ density: appearance.density === "compact" ? "comfortable" : "compact" }))}
            className={itemClass}
          >
            <Rows3 aria-hidden />
            Switch to {appearance.density === "compact" ? "comfortable" : "compact"} density
          </Command.Item>
          <Command.Item
            value="motion reduce animations"
            onSelect={() => run(() => setAppearance({ reduceMotion: !appearance.reduceMotion }))}
            className={itemClass}
          >
            <Zap aria-hidden />
            {appearance.reduceMotion ? "Turn on animations" : "Reduce motion"}
          </Command.Item>
          <Command.Item value="toggle sidebar collapse expand" onSelect={() => run(toggleSidebar)} className={itemClass}>
            <PanelLeft aria-hidden />
            Toggle sidebar
            <Shortcut>
              <Kbd>⌘B</Kbd>
            </Shortcut>
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Not available yet" className={groupClass}>
          {MODULES.filter((module) => !isAvailable(module)).map((module) => (
            <Command.Item key={module.id} value={`module ${module.label}`} disabled className={itemClass}>
              <module.icon aria-hidden className="opacity-60" />
              {module.label}
              <Badge className="ml-auto">{module.milestone ?? "Later"}</Badge>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Account" className={groupClass}>
          <Command.Item value="sign out log out" onSelect={() => run(signOut)} className={itemClass}>
            <LogOut aria-hidden />
            Sign out
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
