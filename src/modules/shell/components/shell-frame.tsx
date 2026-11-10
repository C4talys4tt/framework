"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { authClient } from "@/modules/auth/auth-client";
import { usePreferences } from "@/modules/preferences/components/preferences-provider";
import type { WorkspaceDetail, WorkspaceSummary } from "@/modules/workspaces/domain/workspace";
import { cn } from "@/shared/lib/cn";
import { overlayClassName } from "@/shared/ui/dialog";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { workspacePath } from "../navigation";
import { ShellContext, type ShellState, type ShellUser } from "../shell-context";
import {
  SEQUENCE_TIMEOUT_MS,
  isTypingTarget,
  matchGoToTarget,
  matchModifierShortcut,
  startsGoToSequence,
  type ShortcutCommand,
} from "../shortcuts";
import { CommandPalette } from "./command-palette";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { SidebarContent } from "./sidebar";
import { Topbar } from "./topbar";

export function ShellFrame({
  user,
  workspace,
  workspaces,
  children,
}: {
  user: ShellUser;
  workspace: WorkspaceDetail;
  workspaces: WorkspaceSummary[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = usePreferences();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const signOut = useCallback(() => {
    void authClient.signOut().finally(() => {
      // Deliberate full page load: it discards every cached, session-scoped route.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/sign-in");
    });
  }, []);

  const runShortcut = useCallback(
    (command: ShortcutCommand) => {
      switch (command) {
        case "toggle-palette":
          setPaletteOpen((current) => !current);
          break;
        case "toggle-sidebar":
          toggleSidebar();
          break;
        case "go-overview":
          router.push(workspacePath(workspace.slug, "overview"));
          break;
        case "go-settings":
          router.push(workspacePath(workspace.slug, "settings", "profile"));
          break;
      }
    },
    [router, toggleSidebar, workspace.slug],
  );

  const overlayOpen = paletteOpen || createOpen || mobileNavOpen;
  const overlayOpenRef = useRef(overlayOpen);
  useEffect(() => {
    overlayOpenRef.current = overlayOpen;
  }, [overlayOpen]);

  useEffect(() => {
    let sequenceStartedAt = 0;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;

      const modifier = matchModifierShortcut(event);
      if (modifier) {
        event.preventDefault();
        runShortcut(modifier);
        return;
      }

      if (overlayOpenRef.current || isTypingTarget(event.target)) {
        sequenceStartedAt = 0;
        return;
      }

      if (sequenceStartedAt && event.timeStamp - sequenceStartedAt < SEQUENCE_TIMEOUT_MS) {
        sequenceStartedAt = 0;
        const target = matchGoToTarget(event);
        if (target) {
          event.preventDefault();
          runShortcut(target);
          return;
        }
      }
      sequenceStartedAt = startsGoToSequence(event) ? event.timeStamp : 0;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runShortcut]);

  const shell = useMemo<ShellState>(
    () => ({
      user,
      workspace,
      workspaces,
      openCommandPalette: () => setPaletteOpen(true),
      openCreateWorkspace: () => setCreateOpen(true),
      signOut,
    }),
    [user, workspace, workspaces, signOut],
  );

  // Marks the shell as interactive. Shortcuts only work after hydration, and
  // browser tests wait for this instead of guessing.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.setAttribute("data-shell-ready", "true");
  }, []);

  // Move focus to the page on navigation so keyboard users land in the content.
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [pathname]);

  return (
    <ShellContext value={shell}>
      <TooltipProvider delayDuration={350} skipDelayDuration={150}>
        <a
          href="#main"
          className="fixed left-3 top-3 z-[60] -translate-y-16 rounded-sm border border-accent-line bg-overlay px-3 py-1.5 text-[0.8125rem] font-medium text-fg shadow-overlay transition-transform focus-visible:translate-y-0"
        >
          Skip to content
        </a>

        <div ref={rootRef} className="flex h-dvh overflow-hidden bg-canvas">
          <aside
            data-collapsed={sidebarCollapsed}
            className={cn(
              "hidden shrink-0 border-r border-line-subtle bg-surface transition-[width] duration-200 ease-out-quint md:block",
              sidebarCollapsed ? "w-[3.25rem]" : "w-60",
            )}
          >
            <SidebarContent collapsed={sidebarCollapsed} showCollapseToggle />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
            <main id="main" ref={mainRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>

        <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className={cn(overlayClassName, "md:hidden")} />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-line bg-surface shadow-overlay data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left md:hidden"
            >
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <SidebarContent collapsed={false} showCollapseToggle={false} onNavigate={() => setMobileNavOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      </TooltipProvider>
    </ShellContext>
  );
}
