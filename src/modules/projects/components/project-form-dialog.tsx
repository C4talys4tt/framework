"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@/modules/shell/navigation";
import { fieldErrorsFrom } from "@/shared/lib/action-result";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Labelled } from "@/shared/ui/labelled";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { createProjectAction, updateProjectAction } from "../actions";
import {
  LIMITS,
  PRIORITIES,
  PRIORITY_LABEL,
  projectInputSchema,
  type ProjectCategory,
  type ProjectDetail,
  type ProjectFormValues,
  type ProjectStatus,
} from "../domain/project";
import { CustomFieldsEditor } from "./custom-fields-editor";
import { TagInput } from "./tag-input";

export type ProjectFormMode =
  | { kind: "create"; workspaceId: string; workspaceSlug: string }
  | { kind: "edit"; project: ProjectDetail };

type Options = { statuses: ProjectStatus[]; categories: ProjectCategory[]; tagSuggestions: string[] };

export function ProjectFormDialog({
  open,
  onOpenChange,
  mode,
  ...options
}: { open: boolean; onOpenChange: (open: boolean) => void; mode: ProjectFormMode } & Options) {
  const editing = mode.kind === "edit";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={editing ? "Edit project" : "New project"}
        description={editing ? "Changes are recorded in the project’s activity." : "Start with a name. Everything else can be added later."}
      >
        {/* Mounted only while open, so the form always starts from the saved values. */}
        <ProjectForm mode={mode} onDone={() => onOpenChange(false)} {...options} />
      </DialogContent>
    </Dialog>
  );
}

function initialValues(mode: ProjectFormMode, statuses: ProjectStatus[]): ProjectFormValues {
  if (mode.kind === "edit") {
    const project = mode.project;
    return {
      name: project.name,
      description: project.description,
      statusId: project.status.id,
      categoryId: project.category?.id ?? null,
      client: project.client,
      priority: project.priority,
      startDate: project.startDate ?? "",
      dueDate: project.dueDate ?? "",
      customFields: project.customFields.map((field) => ({ ...field })),
      tags: [...project.tags],
    };
  }
  const first = statuses.find((status) => status.kind === "planned") ?? statuses[0];
  return {
    name: "",
    description: "",
    statusId: first?.id ?? "",
    categoryId: null,
    client: "",
    priority: "normal",
    startDate: "",
    dueDate: "",
    customFields: [],
    tags: [],
  };
}

function ProjectForm({ mode, onDone, statuses, categories, tagSuggestions }: { mode: ProjectFormMode; onDone: () => void } & Options) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ProjectFormValues>(() => initialValues(mode, statuses));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  function showErrors(next: Record<string, string>, message?: string) {
    setErrors(next);
    setFormError(message);
    // Move focus to the first invalid control so keyboard and screen-reader users land on the problem.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = projectInputSchema.safeParse(values);
    if (!parsed.success) {
      showErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    setFormError(undefined);
    setPending(true);
    try {
      if (mode.kind === "create") {
        const result = await createProjectAction({ workspaceId: mode.workspaceId, values });
        if (!result.ok) return showErrors(result.fieldErrors ?? {}, result.fieldErrors ? undefined : result.message);
        onDone();
        router.push(workspacePath(mode.workspaceSlug, "projects", result.data.id));
      } else {
        const result = await updateProjectAction({ projectId: mode.project.id, values });
        if (!result.ok) return showErrors(result.fieldErrors ?? {}, result.fieldErrors ? undefined : result.message);
        onDone();
      }
    } catch {
      setFormError("Could not save the project. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field
        label="Name"
        name="name"
        value={values.name}
        onChange={(event) => set("name", event.target.value)}
        maxLength={LIMITS.projectName}
        placeholder="Northlight title sequence"
        autoComplete="off"
        data-autofocus
        required
        error={errors.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled label="Status" error={errors.statusId}>
          {(control) => (
            <Select {...control} name="status" value={values.statusId} onChange={(event) => set("statusId", event.target.value)}>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </Select>
          )}
        </Labelled>
        <Labelled label="Category" error={errors.categoryId}>
          {(control) => (
            <Select
              {...control}
              name="category"
              value={values.categoryId ?? ""}
              onChange={(event) => set("categoryId", event.target.value || null)}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Labelled>
        <Labelled label="Priority" error={errors.priority}>
          {(control) => (
            <Select {...control} name="priority" value={values.priority} onChange={(event) => set("priority", event.target.value as ProjectFormValues["priority"])}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABEL[priority]}
                </option>
              ))}
            </Select>
          )}
        </Labelled>
        <Field
          label="Client"
          name="client"
          value={values.client}
          onChange={(event) => set("client", event.target.value)}
          maxLength={LIMITS.client}
          placeholder="Optional"
          autoComplete="off"
          error={errors.client}
        />
        <Field
          label="Start date"
          name="startDate"
          type="date"
          value={values.startDate}
          onChange={(event) => set("startDate", event.target.value)}
          error={errors.startDate}
        />
        <Field
          label="Due date"
          name="dueDate"
          type="date"
          value={values.dueDate}
          onChange={(event) => set("dueDate", event.target.value)}
          error={errors.dueDate}
        />
      </div>

      <Labelled label="Description" error={errors.description}>
        {(control) => (
          <Textarea
            {...control}
            name="description"
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
            maxLength={LIMITS.description}
            placeholder="The brief, goals, or anything the team should know."
          />
        )}
      </Labelled>

      <TagInput label="Tags" value={values.tags} onChange={(tags) => set("tags", tags)} suggestions={tagSuggestions} error={errors.tags} />

      <CustomFieldsEditor value={values.customFields} onChange={(fields) => set("customFields", fields)} error={errors.customFields} />

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
          {mode.kind === "create" ? "Create project" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
