"use client";

import { useState, type ComponentProps } from "react";
import { ImagePlus, Link2Off } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { linkReferencesToProjectAction, unlinkManyFromProjectAction, unlinkReferenceFromProjectAction } from "../actions";
import type { ReferenceListItem } from "../domain/reference";
import { ReferenceBrowser } from "./reference-browser";
import { ReferencePickerDialog } from "./reference-picker";
import { UploadButton } from "./upload/upload-controls";

export function ProjectReferenceActions({ workspaceId, projectId, projectName }: { workspaceId: string; projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setOpen(true)}>
          <ImagePlus aria-hidden className="size-3.5" />
          Add from library
        </Button>
        <UploadButton target={{ workspaceId, projectId }} />
      </div>
      <ReferencePickerDialog
        open={open}
        onOpenChange={setOpen}
        source={{ workspaceId, excludeProject: projectId }}
        title={`Link references to “${projectName}”`}
        description="Linked references stay in one place: editing one updates it everywhere it is used."
        confirmLabel={(count) => (count ? `Link ${count} ${count === 1 ? "reference" : "references"}` : "Link references")}
        onConfirm={async (referenceIds) => {
          const result = await linkReferencesToProjectAction({ projectId, referenceIds });
          return result.ok ? undefined : result.message;
        }}
      />
    </>
  );
}

/** The library browser scoped to a project, with "unlink" per card unless the project is archived. */
export function ProjectReferenceBrowser({ archived, ...props }: Omit<ComponentProps<typeof ReferenceBrowser>, "renderMenu" | "bulkExtra"> & { archived: boolean }) {
  const projectId = props.scope.projectId!;
  const [error, setError] = useState<string | null>(null);

  async function unlink(referenceIds: string[]) {
    setError(null);
    const result =
      referenceIds.length === 1
        ? await unlinkReferenceFromProjectAction({ projectId, referenceId: referenceIds[0]! })
        : await unlinkManyFromProjectAction({ projectId, referenceIds });
    if (!result.ok) setError(result.message);
  }

  const renderMenu = archived
    ? undefined
    : (reference: ReferenceListItem) => (
        <button
          type="button"
          aria-label={`Unlink ${reference.title} from this project`}
          title="Unlink from this project"
          onClick={() => void unlink([reference.id])}
          className="grid size-7 place-items-center rounded-full bg-black/35 text-white shadow-raised backdrop-blur transition-colors hover:bg-black/55"
        >
          <Link2Off aria-hidden className="size-3.5" />
        </button>
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
        bulkExtra={
          archived
            ? undefined
            : (ids, clear) => (
                <Button size="sm" variant="ghost" onClick={async () => { await unlink(ids); clear(); }}>
                  <Link2Off aria-hidden className="size-3.5" />
                  Unlink
                </Button>
              )
        }
      />
    </div>
  );
}
