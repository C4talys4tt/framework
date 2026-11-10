"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Labelled } from "@/shared/ui/labelled";
import { Textarea } from "@/shared/ui/textarea";
import { createCollectionAction, updateCollectionAction } from "../actions";
import { LIMITS } from "../domain/reference";

export type CollectionFormMode =
  | { kind: "create"; workspaceId: string; referenceIds?: string[] }
  | { kind: "edit"; collection: { id: string; name: string; description: string } };

export function CollectionFormDialog({
  open,
  onOpenChange,
  mode,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CollectionFormMode;
  onSaved?: (name: string, id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={mode.kind === "create" ? "New collection" : "Edit collection"}
        description={mode.kind === "create" ? "Group references by look, client, shot or anything else. A reference can be in many collections." : undefined}
      >
        {open ? <CollectionForm mode={mode} onDone={(name, id) => { onOpenChange(false); onSaved?.(name, id); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CollectionForm({ mode, onDone }: { mode: CollectionFormMode; onDone: (name: string, id: string) => void }) {
  const [name, setName] = useState(mode.kind === "edit" ? mode.collection.name : "");
  const [description, setDescription] = useState(mode.kind === "edit" ? mode.collection.description : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage(undefined);
    try {
      const values = { name, description };
      if (mode.kind === "create") {
        const result = await createCollectionAction({ workspaceId: mode.workspaceId, values, referenceIds: mode.referenceIds });
        if (result.ok) return onDone(name.trim(), result.data.id);
        setErrors(result.fieldErrors ?? {});
        setMessage(result.fieldErrors ? undefined : result.message);
      } else {
        const result = await updateCollectionAction({ collectionId: mode.collection.id, values });
        if (result.ok) return onDone(name.trim(), mode.collection.id);
        setErrors(result.fieldErrors ?? {});
        setMessage(result.fieldErrors ? undefined : result.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={LIMITS.collectionName} error={errors.name} data-autofocus required />
      <Labelled label="Description" error={errors.description} hint="Optional.">
        {(control) => <Textarea {...control} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={LIMITS.collectionDescription} className="min-h-20" />}
      </Labelled>
      {message ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" pending={pending}>
          {mode.kind === "create" ? "Create collection" : "Save"}
        </Button>
      </div>
    </form>
  );
}
