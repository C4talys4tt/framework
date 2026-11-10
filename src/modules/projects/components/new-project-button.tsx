"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/shared/ui/button";
import type { ProjectCategory, ProjectStatus } from "../domain/project";
import { ProjectFormDialog } from "./project-form-dialog";

export function NewProjectButton({
  workspaceId,
  workspaceSlug,
  statuses,
  categories,
  tagSuggestions,
  autoOpen = false,
  cleanHref,
  variant = "primary",
  children = "New project",
}: {
  workspaceId: string;
  workspaceSlug: string;
  statuses: ProjectStatus[];
  categories: ProjectCategory[];
  tagSuggestions: string[];
  /** Open on arrival, e.g. from the command palette (`?new=1`). */
  autoOpen?: boolean;
  /** Where to go to drop the `new` parameter once the dialog has opened. */
  cleanHref?: string;
  variant?: ButtonProps["variant"];
  children?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);

  // Next keeps previously visited routes mounted, so this component can be revived with `autoOpen`
  // newly true (palette -> "New project" after visiting Projects before). Follow the prop, not just
  // its first value.
  const [sawAutoOpen, setSawAutoOpen] = useState(autoOpen);
  if (autoOpen !== sawAutoOpen) {
    setSawAutoOpen(autoOpen);
    if (autoOpen) setOpen(true);
  }

  useEffect(() => {
    if (autoOpen && cleanHref) router.replace(cleanHref);
  }, [autoOpen, cleanHref, router]);

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        {children}
      </Button>
      <ProjectFormDialog
        open={open}
        onOpenChange={setOpen}
        mode={{ kind: "create", workspaceId, workspaceSlug }}
        statuses={statuses}
        categories={categories}
        tagSuggestions={tagSuggestions}
      />
    </>
  );
}
