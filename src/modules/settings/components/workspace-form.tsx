"use client";

import { useState, type FormEvent } from "react";
import { renameWorkspaceAction } from "@/modules/workspaces/actions";
import { WORKSPACE_NAME_MAX_LENGTH, workspaceNameSchema } from "@/modules/workspaces/domain/workspace";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { SaveStatus, type SaveState } from "./save-status";

export function WorkspaceForm({ workspaceId, name: savedName, canManage }: { workspaceId: string; name: string; canManage: boolean }) {
  const [name, setName] = useState(savedName);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = workspaceNameSchema.safeParse(name);
    setState({ kind: "idle" });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setPending(true);
    try {
      const result = await renameWorkspaceAction({ workspaceId, name: parsed.data });
      if (!result.ok) {
        setFieldError(result.fieldErrors?.name);
        setState({ kind: "error", message: result.message });
        return;
      }
      setName(parsed.data);
      setState({ kind: "saved", message: "Workspace saved" });
    } catch {
      setState({ kind: "error", message: "Could not save the workspace. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field
        label="Workspace name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={WORKSPACE_NAME_MAX_LENGTH}
        autoComplete="off"
        readOnly={!canManage}
        required
        error={fieldError}
        hint={canManage ? undefined : "Only an owner can rename this workspace."}
      />
      {canManage ? (
        <div className="flex items-center justify-end gap-4">
          <SaveStatus state={state} />
          <Button type="submit" variant="primary" pending={pending} disabled={name.trim() === savedName}>
            Save workspace
          </Button>
        </div>
      ) : null}
    </form>
  );
}
