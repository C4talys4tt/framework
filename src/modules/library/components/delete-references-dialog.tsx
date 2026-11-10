"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/shared/ui/dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { deleteReferencesAction, getReferenceUsageAction } from "../actions";
import type { ReferenceUsage } from "../domain/reference";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** What else goes when these references go, in words. Empty when they are used nowhere. */
export function describeUsage(usage: ReferenceUsage): string[] {
  const lines: string[] = [];
  if (usage.placements > 0) {
    lines.push(`Removed from ${plural(usage.moodboards, "moodboard", "moodboards")} (${plural(usage.placements, "placement", "placements")} on the canvas).`);
  }
  if (usage.projects > 0) lines.push(`Unlinked from ${plural(usage.projects, "project", "projects")}.`);
  if (usage.collections > 0) lines.push(`Removed from ${plural(usage.collections, "collection", "collections")}.`);
  return lines;
}

/**
 * Deleting is permanent and cascades, so the dialog first asks the server
 * exactly what depends on the references and says so before anything happens.
 */
export function DeleteReferencesDialog({
  open,
  onOpenChange,
  referenceIds,
  label,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceIds: string[];
  /** "“Neon alley”" or "3 references". */
  label: string;
  onDeleted?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Delete ${label}?`} description="The image files are removed from storage. This cannot be undone.">
        {open ? <DeleteBody referenceIds={referenceIds} onDone={() => { onOpenChange(false); onDeleted?.(); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteBody({ referenceIds, onDone }: { referenceIds: string[]; onDone: () => void }) {
  const [usage, setUsage] = useState<ReferenceUsage | null>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getReferenceUsageAction({ referenceIds }).then((result) => {
      if (cancelled) return;
      if (result.ok) setUsage(result.data);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [referenceIds]);

  const lines = usage ? describeUsage(usage) : [];

  async function confirm() {
    setPending(true);
    setError(undefined);
    try {
      const result = await deleteReferencesAction({ referenceIds });
      if (result.ok) onDone();
      else setError(result.message);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {usage === null && !error ? (
        <div role="status" aria-label="Checking where this is used" className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      ) : lines.length > 0 ? (
        <div className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-[0.8125rem] leading-relaxed text-fg">
          <p className="mb-1 font-medium">This is in use:</p>
          <ul className="list-disc pl-4 text-fg-muted">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : usage ? (
        <p className="text-[0.8125rem] text-fg-muted">It is not in any collection, project or moodboard.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button variant="danger" pending={pending} disabled={usage === null && !error} onClick={confirm} data-autofocus>
          Delete permanently
        </Button>
      </div>
    </div>
  );
}
