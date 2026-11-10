"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field } from "@/shared/ui/field";
import { Labelled } from "@/shared/ui/labelled";
import { Select } from "@/shared/ui/select";
import {
  createCategoryAction,
  createStatusAction,
  deleteCategoryAction,
  deleteStatusAction,
  moveStatusAction,
  updateCategoryAction,
  updateStatusAction,
} from "../actions";
import {
  HUES,
  HUE_DOT,
  HUE_LABEL,
  LIMITS,
  STATUS_KINDS,
  STATUS_KIND_LABEL,
  type Hue,
  type StatusKind,
} from "../domain/project";
import type { CategoryWithUsage, StatusWithUsage } from "../server/taxonomy-repository";
import { HueDot } from "./badges";

type Result = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };

function HuePicker({ value, onChange, label }: { value: Hue; onChange: (hue: Hue) => void; label: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[0.8125rem] font-medium text-fg">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {HUES.map((hue) => (
          <button
            key={hue}
            type="button"
            role="radio"
            aria-checked={hue === value}
            aria-label={HUE_LABEL[hue]}
            onClick={() => onChange(hue)}
            className={cn(
              "grid size-7 place-items-center rounded-full border transition-colors",
              hue === value ? "border-fg" : "border-line hover:border-line-strong",
            )}
          >
            <span className={cn("size-3.5 rounded-full", HUE_DOT[hue])} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

type Draft = { name: string; color: Hue; kind: StatusKind };

/** Create or edit dialog shared by statuses (which also have a kind) and categories. */
function TaxonomyDialog({
  open,
  onOpenChange,
  title,
  noun,
  initial,
  withKind,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  noun: string;
  initial: Draft;
  withKind: boolean;
  onSubmit: (draft: Draft) => Promise<Result>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        <TaxonomyForm noun={noun} initial={initial} withKind={withKind} onSubmit={onSubmit} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TaxonomyForm({
  noun,
  initial,
  withKind,
  onSubmit,
  onDone,
}: {
  noun: string;
  initial: Draft;
  withKind: boolean;
  onSubmit: (draft: Draft) => Promise<Result>;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.name.trim() === "") {
      setError("Give it a name.");
      return;
    }
    setError(undefined);
    setFormError(undefined);
    setPending(true);
    try {
      const result = await onSubmit(draft);
      if (!result.ok) {
        if (result.fieldErrors?.name) setError(result.fieldErrors.name);
        else setFormError(result.message);
        return;
      }
      onDone();
    } catch {
      setFormError(`Could not save the ${noun}. Try again.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field
        label="Name"
        name="name"
        value={draft.name}
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        maxLength={LIMITS.taxonomyName}
        autoComplete="off"
        data-autofocus
        required
        error={error}
      />
      {withKind ? (
        <Labelled label="Type" hint="What the status means. Finished statuses stop due-date warnings.">
          {(control) => (
            <Select
              {...control}
              name="kind"
              value={draft.kind}
              onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as StatusKind }))}
            >
              {STATUS_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {STATUS_KIND_LABEL[kind]}
                </option>
              ))}
            </Select>
          )}
        </Labelled>
      ) : null}
      <HuePicker label="Colour" value={draft.color} onChange={(color) => setDraft((current) => ({ ...current, color }))} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {formError ? (
          <p role="alert" className="mr-auto text-[0.8125rem] text-danger">
            {formError}
          </p>
        ) : null}
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" pending={pending}>
          Save {noun}
        </Button>
      </div>
    </form>
  );
}

const rowClass = "flex min-h-12 items-center gap-3 border-t border-line-subtle px-1 py-2 first:border-t-0";

export function StatusesEditor({ workspaceId, statuses, canManage }: { workspaceId: string; statuses: StatusWithUsage[]; canManage: boolean }) {
  const [editing, setEditing] = useState<StatusWithUsage | "new" | null>(null);
  const [deleting, setDeleting] = useState<StatusWithUsage | null>(null);
  const [moveError, setMoveError] = useState<string>();

  async function move(status: StatusWithUsage, direction: "up" | "down") {
    setMoveError(undefined);
    const result = await moveStatusAction({ statusId: status.id, direction });
    if (!result.ok) setMoveError(result.message);
  }

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Statuses">
        {statuses.map((status, index) => (
          <li key={status.id} className={rowClass}>
            <HueDot hue={status.color} className="size-2.5" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[0.8125rem] font-medium text-fg">{status.name}</span>
              <span className="text-xs text-fg-faint">
                {STATUS_KIND_LABEL[status.kind]} · {status.projectCount} {status.projectCount === 1 ? "project" : "projects"}
              </span>
            </div>
            {canManage ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button size="icon" variant="ghost" aria-label={`Move ${status.name} up`} disabled={index === 0} onClick={() => void move(status, "up")}>
                  <ArrowUp aria-hidden className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${status.name} down`}
                  disabled={index === statuses.length - 1}
                  onClick={() => void move(status, "down")}
                >
                  <ArrowDown aria-hidden className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Edit status ${status.name}`} onClick={() => setEditing(status)}>
                  <Pencil aria-hidden className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Delete status ${status.name}`} onClick={() => setDeleting(status)}>
                  <Trash2 aria-hidden className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {moveError ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {moveError}
        </p>
      ) : null}
      {canManage ? (
        <div>
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden className="size-4" />
            Add status
          </Button>
        </div>
      ) : (
        <p className="text-[0.8125rem] text-fg-faint">Only an owner can change statuses.</p>
      )}

      {editing ? (
        <TaxonomyDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title={editing === "new" ? "Add status" : `Edit status`}
          noun="status"
          withKind
          initial={editing === "new" ? { name: "", color: "blue", kind: "active" } : { name: editing.name, color: editing.color, kind: editing.kind }}
          onSubmit={(draft) =>
            editing === "new"
              ? createStatusAction({ workspaceId, ...draft })
              : updateStatusAction({ statusId: editing.id, ...draft })
          }
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="Statuses that projects use can’t be deleted. Move those projects to another status first."
        confirmLabel="Delete status"
        onConfirm={async () => {
          if (!deleting) return undefined;
          const result = await deleteStatusAction({ statusId: deleting.id });
          return result.ok ? undefined : result.message;
        }}
      />
    </div>
  );
}

export function CategoriesEditor({
  workspaceId,
  categories,
  canManage,
}: {
  workspaceId: string;
  categories: CategoryWithUsage[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<CategoryWithUsage | "new" | null>(null);
  const [deleting, setDeleting] = useState<CategoryWithUsage | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {categories.length === 0 ? (
        <EmptyState title="No categories" description="Categories group projects by kind of work, such as Motion design or Film." className="py-8" />
      ) : (
        <ul aria-label="Categories">
          {categories.map((category) => (
            <li key={category.id} className={rowClass}>
              <HueDot hue={category.color} className="size-2.5" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[0.8125rem] font-medium text-fg">{category.name}</span>
                <span className="text-xs text-fg-faint">
                  {category.projectCount} {category.projectCount === 1 ? "project" : "projects"}
                </span>
              </div>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button size="icon" variant="ghost" aria-label={`Edit category ${category.name}`} onClick={() => setEditing(category)}>
                    <Pencil aria-hidden className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete category ${category.name}`} onClick={() => setDeleting(category)}>
                    <Trash2 aria-hidden className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div>
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden className="size-4" />
            Add category
          </Button>
        </div>
      ) : (
        <p className="text-[0.8125rem] text-fg-faint">Only an owner can change categories.</p>
      )}

      {editing ? (
        <TaxonomyDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title={editing === "new" ? "Add category" : "Edit category"}
          noun="category"
          withKind={false}
          initial={editing === "new" ? { name: "", color: "violet", kind: "active" } : { name: editing.name, color: editing.color, kind: "active" }}
          onSubmit={({ name, color }) =>
            editing === "new"
              ? createCategoryAction({ workspaceId, name, color })
              : updateCategoryAction({ categoryId: editing.id, name, color })
          }
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleting && deleting.projectCount > 0
            ? `${deleting.projectCount} ${deleting.projectCount === 1 ? "project is" : "projects are"} in this category. They’ll be kept and become uncategorised.`
            : "No projects use this category."
        }
        confirmLabel="Delete category"
        onConfirm={async () => {
          if (!deleting) return undefined;
          const result = await deleteCategoryAction({ categoryId: deleting.id });
          return result.ok ? undefined : result.message;
        }}
      />
    </div>
  );
}
