"use client";

import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { FolderMinus, ImagePlus, MoreHorizontal, Pencil, Trash2, Undo2, Wallpaper } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { addToCollectionAction, deleteCollectionAction, removeFromCollectionAction, removeManyFromCollectionAction, setCollectionCoverAction } from "../actions";
import type { CollectionSummary, ReferenceListItem } from "../domain/reference";
import { CollectionFormDialog } from "./collection-form-dialog";
import { ReferenceBrowser } from "./reference-browser";
import { ReferencePickerDialog } from "./reference-picker";
import { UploadButton } from "./upload/upload-controls";

export function CollectionHeaderActions({
  collection,
  workspaceId,
  collectionsHref,
  compact = false,
}: {
  collection: CollectionSummary;
  workspaceId: string;
  collectionsHref: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => setPickerOpen(true)}>
        <ImagePlus aria-hidden className="size-3.5" />
        Add from library
      </Button>
      <UploadButton target={{ workspaceId, collectionId: collection.id }} />
      {compact ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" aria-label="More collection actions">
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil aria-hidden />
              Rename or describe…
            </DropdownMenuItem>
            {collection.coverIsExplicit ? (
              <DropdownMenuItem onSelect={() => void setCollectionCoverAction({ collectionId: collection.id, referenceId: null })}>
                <Undo2 aria-hidden />
                Use automatic cover
              </DropdownMenuItem>
            ) : null}
            {collection.canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-danger [&_svg]:!text-danger">
                  <Trash2 aria-hidden />
                  Delete collection…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ReferencePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        source={{ workspaceId, excludeCollection: collection.id }}
        title={`Add to “${collection.name}”`}
        description="Choose references from the library. Nothing is copied: the same reference can be in any number of collections."
        confirmLabel={(count) => (count ? `Add ${count} ${count === 1 ? "reference" : "references"}` : "Add references")}
        onConfirm={async (referenceIds) => {
          const result = await addToCollectionAction({ collectionId: collection.id, referenceIds });
          return result.ok ? undefined : result.message;
        }}
      />
      <CollectionFormDialog open={editOpen} onOpenChange={setEditOpen} mode={{ kind: "edit", collection }} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${collection.name}”?`}
        description={`The collection is removed. Its ${collection.count} ${collection.count === 1 ? "reference stays" : "references stay"} in the library, in other collections, projects and moodboards.`}
        confirmLabel="Delete collection"
        onConfirm={async () => {
          const result = await deleteCollectionAction({ collectionId: collection.id });
          if (!result.ok) return result.message;
          router.push(collectionsHref);
          return undefined;
        }}
      />
    </div>
  );
}

/** The library browser, plus per-card "use as cover" and "remove from collection". */
export function CollectionBrowser({
  coverId,
  ...props
}: Omit<ComponentProps<typeof ReferenceBrowser>, "renderMenu" | "bulkExtra"> & { coverId: string | null }) {
  const collectionId = props.scope.collectionId!;
  const [error, setError] = useState<string | null>(null);

  async function run(work: Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    const result = await work;
    if (!result.ok) setError(result.message ?? "Something went wrong.");
  }

  const renderMenu = (reference: ReferenceListItem) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Actions for ${reference.title}`} className="grid size-7 place-items-center rounded-full bg-black/35 text-white shadow-raised backdrop-blur transition-colors hover:bg-black/55">
          <MoreHorizontal aria-hidden className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {coverId === reference.id ? (
          <DropdownMenuItem onSelect={() => void run(setCollectionCoverAction({ collectionId, referenceId: null }))}>
            <Undo2 aria-hidden />
            Stop using as cover
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => void run(setCollectionCoverAction({ collectionId, referenceId: reference.id }))}>
            <Wallpaper aria-hidden />
            Use as cover
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void run(removeFromCollectionAction({ collectionId, referenceId: reference.id }))}>
          <FolderMinus aria-hidden />
          Remove from collection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      <ReferenceBrowser
        {...props}
        renderMenu={renderMenu}
        bulkExtra={(ids, clear) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await run(removeManyFromCollectionAction({ collectionId, referenceIds: ids }));
              clear();
            }}
          >
            <FolderMinus aria-hidden className="size-3.5" />
            Remove from collection
          </Button>
        )}
      />
    </div>
  );
}
