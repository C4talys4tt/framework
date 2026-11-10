"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Labelled } from "@/shared/ui/labelled";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { createMoodboardAction, updateMoodboardAction } from "../actions";
import { BOARD_LIMITS } from "../domain/moodboard";

export type MoodboardFormMode =
  | { kind: "create"; workspaceId: string; projectId?: string | null }
  | { kind: "edit"; moodboard: { id: string; name: string; description: string; project: { id: string; name: string } | null } };

export function MoodboardFormDialog({
  open,
  onOpenChange,
  mode,
  projects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: MoodboardFormMode;
  /** Active projects a board can be assigned to. */
  projects: { id: string; name: string }[];
  onSaved?: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={mode.kind === "create" ? "New moodboard" : "Moodboard details"}
        description={mode.kind === "create" ? "A freeform canvas for arranging references and notes. A project can have as many as it needs." : undefined}
      >
        {open ? <MoodboardForm mode={mode} projects={projects} onDone={(id) => { onOpenChange(false); onSaved?.(id); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MoodboardForm({ mode, projects, onDone }: { mode: MoodboardFormMode; projects: { id: string; name: string }[]; onDone: (id: string) => void }) {
  const board = mode.kind === "edit" ? mode.moodboard : null;
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [projectId, setProjectId] = useState(board ? (board.project?.id ?? "") : mode.kind === "create" ? (mode.projectId ?? "") : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  // An archived project keeps its boards but cannot be chosen; show it so the select is truthful.
  const options = board?.project && !projects.some((project) => project.id === board.project!.id) ? [...projects, board.project] : projects;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage(undefined);
    const values = { name, description, projectId: projectId || null };
    try {
      const result =
        mode.kind === "create"
          ? await createMoodboardAction({ workspaceId: mode.workspaceId, values })
          : await updateMoodboardAction({ moodboardId: mode.moodboard.id, values });
      if (result.ok) return onDone(mode.kind === "create" ? (result.data as { id: string }).id : mode.moodboard.id);
      setErrors(result.fieldErrors ?? {});
      setMessage(result.fieldErrors ? undefined : result.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={BOARD_LIMITS.name} error={errors.name} data-autofocus required />
      <Labelled label="Description" error={errors.description} hint="Optional. What the board is for: a look, a sequence, a pitch.">
        {(control) => <Textarea {...control} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={BOARD_LIMITS.description} className="min-h-20" />}
      </Labelled>
      <Labelled label="Project" error={errors.projectId}>
        {(control) => (
          <Select {...control} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">No project</option>
            {options.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        )}
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
          {mode.kind === "create" ? "Create and open" : "Save"}
        </Button>
      </div>
    </form>
  );
}
