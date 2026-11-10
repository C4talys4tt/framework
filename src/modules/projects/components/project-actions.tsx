"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { archiveProjectAction, restoreProjectAction, setProjectStatusAction } from "../actions";
import type { ProjectCategory, ProjectDetail, ProjectStatus } from "../domain/project";
import { HueDot, StatusBadge } from "./badges";
import { ProjectFormDialog } from "./project-form-dialog";

type Options = { statuses: ProjectStatus[]; categories: ProjectCategory[]; tagSuggestions: string[] };

/** The status pill doubles as a menu for the most common edit. Archived projects are read-only. */
export function StatusMenu({ project, statuses }: { project: ProjectDetail; statuses: ProjectStatus[] }) {
  const [error, setError] = useState<string>();
  const archived = project.archivedAt !== null;

  if (archived) return <StatusBadge status={project.status} />;

  async function choose(statusId: string) {
    if (statusId === project.status.id) return;
    setError(undefined);
    const result = await setProjectStatusAction({ projectId: project.id, statusId });
    if (!result.ok) setError(result.message);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Status: ${project.status.name}. Change status`}
            className="group inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-line bg-raised pl-2.5 pr-1.5 text-xs font-medium text-fg transition-colors hover:border-line-strong"
          >
            <HueDot hue={project.status.color} />
            <span className="truncate">{project.status.name}</span>
            <ChevronDown aria-hidden className="size-3 text-fg-faint" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuLabel>Set status</DropdownMenuLabel>
          {statuses.map((status) => (
            <DropdownMenuItem key={status.id} onSelect={() => void choose(status.id)} aria-current={status.id === project.status.id ? "true" : undefined}>
              <HueDot hue={status.color} className="!text-current" />
              {status.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function ProjectActions({ project, ...options }: { project: ProjectDetail } & Options) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archived = project.archivedAt !== null;

  return (
    <div className="flex items-center gap-2">
      {archived ? (
        <Button
          onClick={async () => {
            await restoreProjectAction({ projectId: project.id });
          }}
        >
          <ArchiveRestore aria-hidden className="size-4" />
          Restore project
        </Button>
      ) : (
        <>
          <Button onClick={() => setEditOpen(true)}>
            <Pencil aria-hidden className="size-3.5" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" aria-label="More project actions">
                <MoreHorizontal aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                <Archive aria-hidden />
                Archive project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} mode={{ kind: "edit", project }} {...options} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this project?"
        description={`“${project.name}” moves out of your active list and becomes read-only. You can restore it at any time.`}
        confirmLabel="Archive project"
        tone="primary"
        onConfirm={async () => {
          const result = await archiveProjectAction({ projectId: project.id });
          return result.ok ? undefined : result.message;
        }}
      />
    </div>
  );
}
