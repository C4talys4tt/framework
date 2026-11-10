"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createWorkspaceAction } from "@/modules/workspaces/actions";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/modules/workspaces/domain/workspace";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { workspacePath } from "../navigation";

export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New workspace"
        description="A workspace keeps its projects, libraries and notes separate from your others."
      >
        {/* Mounted only while open, so the form always starts clean. */}
        <CreateWorkspaceForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateWorkspaceForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const result = await createWorkspaceAction({ name });
      if (!result.ok) {
        setError(result.fieldErrors?.name ?? result.message);
        return;
      }
      onDone();
      router.push(workspacePath(result.data.slug, "overview"));
    } catch {
      setError("Could not create the workspace. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field
        label="Name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Northlight Studio"
        maxLength={WORKSPACE_NAME_MAX_LENGTH}
        autoComplete="off"
        data-autofocus
        required
        error={error}
      />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" pending={pending}>
          Create workspace
        </Button>
      </div>
    </form>
  );
}
