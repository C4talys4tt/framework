"use client";

import { useState, type FormEvent } from "react";
import { MessageSquareText, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { fieldErrorsFrom } from "@/shared/lib/action-result";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field } from "@/shared/ui/field";
import { Labelled } from "@/shared/ui/labelled";
import { LocalDate } from "@/shared/ui/local-date";
import { Surface } from "@/shared/ui/surface";
import { Textarea } from "@/shared/ui/textarea";
import { createNoteAction, deleteNoteAction, setNotePinnedAction, updateNoteAction } from "../actions";
import type { NoteItem } from "../domain/notes";
import { LIMITS, noteInputSchema } from "../domain/project";

type Viewer = { userId: string; isOwner: boolean };

export function NotesPanel({
  projectId,
  notes,
  viewer,
  archived,
}: {
  projectId: string;
  notes: NoteItem[];
  viewer: Viewer;
  archived: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {archived ? (
        <p className="text-[0.8125rem] text-fg-muted">Notes are read-only while the project is archived.</p>
      ) : (
        <NoteForm
          label="New note"
          submitLabel="Add note"
          onSubmit={(values) => createNoteAction({ projectId, ...values })}
        />
      )}

      {notes.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<MessageSquareText aria-hidden className="size-4" />}
            title="No notes yet"
            description="Capture feedback, decisions and reminders for this project. Pin the ones that matter."
          />
        </Surface>
      ) : (
        <ul aria-label="Notes" className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} viewer={viewer} archived={archived} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type NoteValues = { title: string; body: string };

function NoteForm({
  label,
  submitLabel,
  initial = { title: "", body: "" },
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initial?: NoteValues;
  onSubmit: (values: NoteValues) => Promise<{ ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> }>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = noteInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    setFormError(undefined);
    setPending(true);
    try {
      const result = await onSubmit(parsed.data);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? undefined : result.message);
        return;
      }
      setValues({ title: "", body: "" });
      onCancel?.();
    } catch {
      setFormError("Could not save the note. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label={label} className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface p-4 shadow-raised">
      <Field
        label="Title (optional)"
        name="title"
        value={values.title}
        maxLength={LIMITS.noteTitle}
        autoComplete="off"
        onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
        error={errors.title}
      />
      <Labelled label="Note" error={errors.body}>
        {(control) => (
          <Textarea
            {...control}
            name="body"
            value={values.body}
            maxLength={LIMITS.noteBody}
            placeholder="Write a note…"
            onChange={(event) => setValues((current) => ({ ...current, body: event.target.value }))}
          />
        )}
      </Labelled>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {formError ? (
          <p role="alert" className="mr-auto text-[0.8125rem] text-danger">
            {formError}
          </p>
        ) : null}
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" pending={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function NoteCard({ note, viewer, archived }: { note: NoteItem; viewer: Viewer; archived: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const canChange = !archived && (note.authorId === viewer.userId || viewer.isOwner);

  if (editing) {
    return (
      <NoteForm
        label="Edit note"
        submitLabel="Save note"
        initial={{ title: note.title, body: note.body }}
        onSubmit={(values) => updateNoteAction({ noteId: note.id, ...values })}
        onCancel={() => setEditing(false)}
      />
    );
  }

  async function togglePin() {
    setActionError(undefined);
    const result = await setNotePinnedAction({ noteId: note.id, pinned: !note.pinned });
    if (!result.ok) setActionError(result.message);
  }

  return (
    <Surface className="p-4" data-pinned={note.pinned || undefined}>
      <article aria-label={note.title || "Untitled note"} className="flex flex-col gap-3">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
              {note.pinned ? <Pin aria-label="Pinned" className="size-3.5 shrink-0 text-accent" /> : null}
              <span className="truncate">{note.title || <span className="text-fg-muted">Untitled note</span>}</span>
            </h3>
            <p className="text-xs text-fg-faint">
              {note.authorName ?? "Former member"} ·{" "}
              <LocalDate value={note.createdAt.toISOString()} options={{ day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }} />
              {note.editedAt ? " · edited" : ""}
            </p>
          </div>
          {canChange ? (
            <div className="flex shrink-0 items-center gap-0.5">
              <Button size="icon" variant="ghost" aria-label={note.pinned ? "Unpin note" : "Pin note"} onClick={() => void togglePin()}>
                {note.pinned ? <PinOff aria-hidden className="size-3.5" /> : <Pin aria-hidden className="size-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" aria-label="Edit note" onClick={() => setEditing(true)}>
                <Pencil aria-hidden className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Delete note" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </header>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{note.body}</p>
        {actionError ? (
          <p role="alert" className="text-[0.8125rem] text-danger">
            {actionError}
          </p>
        ) : null}
      </article>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this note?"
        description="The note is removed for everyone. The project’s activity keeps a record that it existed."
        confirmLabel="Delete note"
        onConfirm={async () => {
          const result = await deleteNoteAction({ noteId: note.id });
          return result.ok ? undefined : result.message;
        }}
      />
    </Surface>
  );
}
