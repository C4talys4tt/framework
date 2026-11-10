"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Copy, LayoutPanelLeft, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { LocalDate } from "@/shared/ui/local-date";
import { deleteMoodboardAction, duplicateMoodboardAction } from "../actions";
import type { MoodboardSummary } from "../domain/moodboard";
import { MoodboardFormDialog } from "./moodboard-form-dialog";
import { ReferenceImage } from "./reference-image";

/** Light backgrounds need dark placeholder strokes. */
function isLight(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}

export function NewMoodboardButton({
  workspaceId,
  boardsHref,
  projects,
  projectId,
  autoOpen = false,
  label = "New moodboard",
}: {
  workspaceId: string;
  boardsHref: string;
  projects: { id: string; name: string }[];
  projectId?: string;
  autoOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(autoOpen);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (autoOpen) router.replace(pathname, { scroll: false });
  }, [autoOpen, pathname, router]);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-3.5" />
        {label}
      </Button>
      <MoodboardFormDialog
        open={open}
        onOpenChange={setOpen}
        mode={{ kind: "create", workspaceId, projectId }}
        projects={projects}
        onSaved={(id) => router.push(`${boardsHref}/${id}`)}
      />
    </>
  );
}

export function MoodboardGrid({ boards, boardsHref, projects }: { boards: MoodboardSummary[]; boardsHref: string; projects: { id: string; name: string }[] }) {
  return (
    <ul aria-label="Moodboards" className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-5">
      {boards.map((board) => (
        <li key={board.id}>
          <MoodboardCard board={board} href={`${boardsHref}/${board.id}`} boardsHref={boardsHref} projects={projects} />
        </li>
      ))}
    </ul>
  );
}

function MoodboardCard({ board, href, boardsHref, projects }: { board: MoodboardSummary; href: string; boardsHref: string; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const light = isLight(board.background);
  // A loose, collage-like arrangement of the top images, so boards are recognisable at a glance.
  const slots = ["left-[8%] top-[12%] w-[46%] rotate-[-3deg]", "right-[8%] top-[8%] w-[38%] rotate-[2.5deg]", "left-[22%] bottom-[8%] w-[34%] rotate-[1.5deg]", "right-[14%] bottom-[12%] w-[30%] rotate-[-2deg]"];

  return (
    <div className="group relative flex flex-col gap-3">
      <Link
        href={href}
        className="relative block aspect-[16/10] overflow-hidden rounded-lg border border-line-subtle shadow-raised outline-offset-4 transition-[border-color,transform] duration-300 ease-out-quint group-hover:-translate-y-0.5 group-hover:border-line-strong"
        style={{ backgroundColor: board.background }}
      >
        <span
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{ backgroundImage: `radial-gradient(${light ? "rgb(0 0 0 / 0.12)" : "rgb(255 255 255 / 0.07)"} 1px, transparent 1px)`, backgroundSize: "14px 14px" }}
        />
        {board.previews.length === 0 ? (
          <span className={`absolute inset-0 grid place-items-center ${light ? "text-black/30" : "text-white/25"}`}>
            <LayoutPanelLeft aria-hidden className="size-6" />
          </span>
        ) : (
          board.previews.map((preview, index) => (
            <ReferenceImage
              key={preview.id}
              referenceId={preview.id}
              alt=""
              dominantColor={preview.dominantColor}
              className={`absolute aspect-[4/3] rounded-[3px] shadow-[0_6px_18px_-6px_rgb(0_0_0/0.6)] ${slots[index]}`}
            />
          ))
        )}
        <span className="sr-only">Open {board.name}</span>
      </Link>
      <div className="flex items-start gap-2 px-0.5">
        <div className="min-w-0 flex-1">
          <Link href={href} className="block truncate text-sm font-medium text-fg hover:text-accent">
            {board.name}
          </Link>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-faint">
            {board.project ? <span className="max-w-40 truncate text-fg-muted">{board.project.name}</span> : null}
            {board.project ? <span aria-hidden>·</span> : null}
            <span>
              {board.elementCount} {board.elementCount === 1 ? "item" : "items"}
            </span>
            <span aria-hidden>·</span>
            <LocalDate value={board.updatedAt} options={{ day: "numeric", month: "short" }} />
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`Actions for ${board.name}`} className="-mr-1 size-7">
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil aria-hidden />
              Edit details…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                setError(null);
                const result = await duplicateMoodboardAction({ moodboardId: board.id });
                if (result.ok) router.push(`${boardsHref}/${result.data.id}`);
                else setError(result.message);
              }}
            >
              <Copy aria-hidden />
              Duplicate
            </DropdownMenuItem>
            {board.canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-danger [&_svg]:!text-danger">
                  <Trash2 aria-hidden />
                  Delete…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <MoodboardFormDialog open={editOpen} onOpenChange={setEditOpen} mode={{ kind: "edit", moodboard: board }} projects={projects} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${board.name}”?`}
        description="The board and its layout are deleted. The references on it stay in the library."
        confirmLabel="Delete moodboard"
        onConfirm={async () => {
          const result = await deleteMoodboardAction({ moodboardId: board.id });
          return result.ok ? undefined : result.message;
        }}
      />
    </div>
  );
}
