"use client";

import { useState } from "react";
import { FolderPlus, Link2, Plus, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { addTagToReferencesAction, addToCollectionAction, linkReferencesToProjectAction } from "../actions";
import { CollectionFormDialog } from "./collection-form-dialog";
import { DeleteReferencesDialog } from "./delete-references-dialog";

/** Acting on several references at once. Sticks to the bottom of the view while anything is selected. */
export function BulkActions({
  workspaceId,
  selectedIds,
  collections,
  projects,
  onClear,
  onDeleted,
  extra,
}: {
  workspaceId: string;
  selectedIds: string[];
  collections: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  onClear: () => void;
  onDeleted: (ids: string[]) => void;
  extra?: React.ReactNode;
}) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const count = selectedIds.length;

  async function run(work: () => Promise<{ ok: true; text: string } | { ok: false; text: string }>) {
    setMessage(null);
    const result = await work();
    setMessage({ tone: result.ok ? "ok" : "error", text: result.text });
  }

  return (
    <div className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-line bg-overlay/95 p-1.5 pl-3.5 shadow-overlay backdrop-blur animate-pop-in">
      <p className="mr-1 text-[0.8125rem] font-medium text-fg" role="status">
        {count} selected
      </p>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <FolderPlus aria-hidden className="size-3.5" />
            Add to collection
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Add to collection</DropdownMenuLabel>
          {collections.map((collection) => (
            <DropdownMenuItem
              key={collection.id}
              onSelect={() =>
                void run(async () => {
                  const result = await addToCollectionAction({ collectionId: collection.id, referenceIds: selectedIds });
                  return result.ok
                    ? { ok: true, text: result.data.added ? `Added ${result.data.added} to “${collection.name}”.` : `Already in “${collection.name}”.` }
                    : { ok: false, text: result.message };
                })
              }
            >
              {collection.name}
            </DropdownMenuItem>
          ))}
          {collections.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            New collection…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost">
            <Tag aria-hidden className="size-3.5" />
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = tag.trim();
              if (!name) return;
              void run(async () => {
                const result = await addTagToReferencesAction({ workspaceId, name, referenceIds: selectedIds });
                if (result.ok) {
                  setTag("");
                  setTagOpen(false);
                  return { ok: true, text: `Tagged ${count} with “${name}”.` };
                }
                return { ok: false, text: result.message };
              });
            }}
          >
            <Input autoFocus aria-label="Tag to add" placeholder="Tag name" value={tag} maxLength={30} onChange={(event) => setTag(event.target.value)} className="h-8 text-[0.8125rem]" />
            <Button type="submit" size="sm" variant="primary" disabled={!tag.trim()}>
              Add
            </Button>
          </form>
        </PopoverContent>
      </Popover>

      {projects.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <Link2 aria-hidden className="size-3.5" />
              Link to project
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Link to project</DropdownMenuLabel>
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onSelect={() =>
                  void run(async () => {
                    const result = await linkReferencesToProjectAction({ projectId: project.id, referenceIds: selectedIds });
                    return result.ok
                      ? { ok: true, text: result.data.linked ? `Linked ${result.data.linked} to “${project.name}”.` : `Already linked to “${project.name}”.` }
                      : { ok: false, text: result.message };
                  })
                }
              >
                {project.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {extra}

      <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeleteOpen(true)}>
        <Trash2 aria-hidden className="size-3.5" />
        Delete
      </Button>
      <Button size="icon" variant="ghost" aria-label="Clear selection" onClick={onClear} className="size-7">
        <X aria-hidden className="size-4" />
      </Button>

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`basis-full px-0.5 pb-0.5 text-xs ${message.tone === "error" ? "text-danger" : "text-fg-muted"}`}>
          {message.text}
        </p>
      ) : null}

      <DeleteReferencesDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        referenceIds={selectedIds}
        label={count === 1 ? "this reference" : `${count} references`}
        onDeleted={() => onDeleted(selectedIds)}
      />
      <CollectionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode={{ kind: "create", workspaceId, referenceIds: selectedIds }}
        onSaved={(name) => setMessage({ tone: "ok", text: `Created “${name}” with ${count} ${count === 1 ? "reference" : "references"}.` })}
      />
    </div>
  );
}
