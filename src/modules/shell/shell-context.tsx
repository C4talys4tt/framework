"use client";

import { createContext, use } from "react";
import type { WorkspaceDetail, WorkspaceSummary } from "@/modules/workspaces/domain/workspace";

export type ShellUser = { name: string; email: string };

export type ShellState = {
  user: ShellUser;
  workspace: WorkspaceDetail;
  workspaces: WorkspaceSummary[];
  openCommandPalette: () => void;
  openCreateWorkspace: () => void;
  signOut: () => void;
};

export const ShellContext = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const value = use(ShellContext);
  if (!value) throw new Error("useShell must be used inside the workspace shell");
  return value;
}
