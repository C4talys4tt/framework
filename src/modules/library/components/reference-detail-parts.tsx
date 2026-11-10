"use client";

import { useId, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Download, ExternalLink, FolderPlus, Link2, MoreHorizontal, Plus, Star, Trash2, X } from "lucide-react";
import { normalizeTags, splitTagInput } from "@/modules/projects/domain/project";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { Labelled } from "@/shared/ui/labelled";
import { Textarea } from "@/shared/ui/textarea";
import {
  addToCollectionAction,
  linkReferencesToProjectAction,
  removeFromCollectionAction,
  setFavoriteAction,
  setReferenceTagsAction,
  unlinkReferenceFromProjectAction,
  updateReferenceAction,
} from "../actions";
import { LIMITS, fileUrl, type LinkedCollection, type LinkedProject, type ReferenceDetail } from "../domain/reference";
import { CollectionFormDialog } from "./collection-form-dialog";
import { DeleteReferencesDialog } from "./delete-references-dialog";

function ErrorText({ message }: { message?: string | null }) {
  return message ? (
    <p role="alert" className="text-[0.8125rem] text-danger">
      {message}
    </p>
  ) : null;
}

export function ReferenceHeaderActions({ reference, libraryHref }: { reference: ReferenceDetail; libraryHref: string }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(reference.favorite);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [seenFavorite, setSeenFavorite] = useState(reference.favorite);
  if (seenFavorite !== reference.favorite) {
    setSeenFavorite(reference.favorite);
    setFavorite(reference.favorite);
  }

  async function toggle() {
    const next = !favorite;
    setFavorite(next);
    setError(undefined);
    const result = await setFavoriteAction({ referenceId: reference.id, favorite: next, refresh: true });
    if (!result.ok) {
      setFavorite(!next);
      setError(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button variant={favorite ? "secondary" : "secondary"} onClick={toggle} aria-pressed={favorite} className={cn(favorite && "border-hue-amber/40 text-hue-amber")}>
          <Star aria-hidden className={cn("size-3.5", favorite && "fill-current")} />
          {favorite ? "Favorite" : "Add to favorites"}
        </Button>
        <Button asChild variant="secondary">
          <a href={`${fileUrl(reference.id, "original")}?download=1`} download>
            <Download aria-hidden className="size-3.5" />
            Download
          </a>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" aria-label="More reference actions" className="ml-auto">
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={fileUrl(reference.id, "original")} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Open original
              </a>
            </DropdownMenuItem>
            {reference.canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-danger [&_svg]:!text-danger">
                  <Trash2 aria-hidden />
                  Delete reference…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ErrorText message={error} />
      <DeleteReferencesDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        referenceIds={[reference.id]}
        label={`“${reference.title}”`}
        onDeleted={() => router.push(libraryHref)}
      />
    </div>
  );
}

/** Title, description and source link. Edits are explicit: Save (or ⌘/Ctrl+Enter), or Discard. */
export function ReferenceMetaForm({ reference }: { reference: ReferenceDetail }) {
  const initial = { title: reference.title, description: reference.description, sourceUrl: reference.sourceUrl ?? "" };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = values.title !== initial.title || values.description !== initial.description || values.sourceUrl !== initial.sourceUrl;

  // A save elsewhere (another tab, a refresh) replaces the baseline when nothing is being edited here.
  const key = `${reference.title}\u0000${reference.description}\u0000${reference.sourceUrl ?? ""}`;
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setValues({ title: reference.title, description: reference.description, sourceUrl: reference.sourceUrl ?? "" });
  }

  function save() {
    setMessage(null);
    setErrors({});
    startTransition(async () => {
      const result = await updateReferenceAction({ referenceId: reference.id, values });
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.fieldErrors ? null : result.message);
      }
    });
  }

  function onKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && dirty) {
      event.preventDefault();
      save();
    }
  }

  return (
    <form
      aria-label="Reference information"
      className="flex flex-col gap-4"
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) save();
      }}
    >
      <Labelled label="Title" error={errors.title}>
        {(control) => (
          <Input
            {...control}
            value={values.title}
            maxLength={LIMITS.title}
            onChange={(event) => setValues({ ...values, title: event.target.value })}
            className="h-10 text-base font-semibold tracking-tight"
          />
        )}
      </Labelled>
      <Labelled label="Description" error={errors.description}>
        {(control) => (
          <Textarea
            {...control}
            value={values.description}
            maxLength={LIMITS.description}
            placeholder="What to take from this: light, palette, framing, texture…"
            onChange={(event) => setValues({ ...values, description: event.target.value })}
            className="min-h-24"
          />
        )}
      </Labelled>
      <Labelled label="Source" error={errors.sourceUrl} hint={values.sourceUrl && !errors.sourceUrl && values.sourceUrl === initial.sourceUrl ? <SourceLink url={values.sourceUrl} /> : undefined}>
        {(control) => (
          <Input
            {...control}
            type="url"
            inputMode="url"
            value={values.sourceUrl}
            maxLength={LIMITS.sourceUrl}
            placeholder="https://"
            onChange={(event) => setValues({ ...values, sourceUrl: event.target.value })}
          />
        )}
      </Labelled>
      <ErrorText message={message} />
      {dirty || pending || saved ? (
      <div className="flex items-center justify-end gap-2 animate-fade-in">
        {saved && !dirty ? (
          <p role="status" className="mr-auto text-xs text-success">
            Saved
          </p>
        ) : null}
        <Button variant="ghost" size="sm" disabled={!dirty || pending} onClick={() => { setValues(initial); setErrors({}); setMessage(null); }}>
          Discard
        </Button>
        <Button type="submit" variant="primary" size="sm" pending={pending} disabled={!dirty}>
          Save changes
        </Button>
      </div>
      ) : null}
    </form>
  );
}

function SourceLink({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Shown as typed.
  }
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent hover:underline">
      Open {host}
      <ExternalLink aria-hidden className="size-3" />
    </a>
  );
}

/** Chips plus a text box; every change is saved at once. */
export function ReferenceTagsEditor({ referenceId, tags, suggestions, libraryHref }: { referenceId: string; tags: string[]; suggestions: string[]; libraryHref: string }) {
  const [value, setValue] = useState(tags);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const [seenTags, setSeenTags] = useState(tags);
  if (seenTags !== tags) {
    setSeenTags(tags);
    setValue(tags);
  }

  async function commit(next: string[]) {
    const normalized = normalizeTags(next).slice(0, LIMITS.tagsPerReference);
    const previous = value;
    setValue(normalized);
    setError(null);
    const result = await setReferenceTagsAction({ referenceId, tags: normalized });
    if (!result.ok) {
      setValue(previous);
      setError(result.message);
    }
  }

  function add(text: string) {
    setDraft("");
    const additions = splitTagInput(text).filter((entry) => entry.trim());
    if (additions.length) void commit([...value, ...additions]);
  }

  const available = suggestions.filter((suggestion) => !value.some((tag) => tag.toLowerCase() === suggestion.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-line bg-canvas p-1.5 focus-within:border-accent-line focus-within:ring-2 focus-within:ring-accent-soft">
        {value.length > 0 ? (
          <ul aria-label="Tags on this reference" className="contents">
            {value.map((tag) => (
              <li key={tag.toLowerCase()} className="inline-flex h-6 items-center gap-0.5 rounded-xs border border-line bg-raised pl-2 pr-0.5 text-xs text-fg">
                <Link href={`${libraryHref}?tag=${encodeURIComponent(tag)}`} className="hover:text-accent">
                  {tag}
                </Link>
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => void commit(value.filter((existing) => existing !== tag))}
                  className="grid size-5 place-items-center rounded-xs text-fg-faint hover:bg-hover hover:text-fg"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          aria-label="Add a tag"
          value={draft}
          list={listId}
          maxLength={LIMITS.tagName * 4}
          autoComplete="off"
          placeholder={value.length === 0 ? "Add tags: mood, palette, technique…" : "Add a tag…"}
          disabled={value.length >= LIMITS.tagsPerReference}
          onChange={(event) => {
            const text = event.target.value;
            if (text.includes(",") || text.includes("\n")) add(text);
            else setDraft(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) {
              event.preventDefault();
              add(draft);
            } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
              void commit(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          className="h-6 min-w-32 flex-1 bg-transparent px-1.5 text-sm text-fg outline-none placeholder:text-fg-faint"
        />
        <datalist id={listId}>
          {available.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </div>
      <ErrorText message={error} />
    </div>
  );
}

function LinkChip({ href, label, onRemove, removeLabel, muted }: { href: string; label: string; onRemove?: () => void; removeLabel: string; muted?: boolean }) {
  return (
    <li className="group flex items-center gap-1 rounded-sm border border-line-subtle bg-surface pr-1 transition-colors hover:border-line">
      <Link href={href} className={cn("min-w-0 flex-1 truncate px-2.5 py-1.5 text-[0.8125rem] hover:text-accent", muted ? "text-fg-muted" : "text-fg")}>
        {label}
      </Link>
      {onRemove ? (
        <button type="button" aria-label={removeLabel} onClick={onRemove} className="grid size-6 shrink-0 place-items-center rounded-xs text-fg-faint opacity-60 hover:bg-hover hover:text-fg group-hover:opacity-100">
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}

export function ReferenceCollections({
  referenceId,
  linked,
  choices,
  workspaceId,
  libraryHref,
}: {
  referenceId: string;
  linked: LinkedCollection[];
  choices: { id: string; name: string }[];
  workspaceId: string;
  libraryHref: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const available = choices.filter((choice) => !linked.some((collection) => collection.id === choice.id));

  async function run(work: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    const result = await work();
    if (!result.ok) setError(result.message ?? "Something went wrong.");
  }

  return (
    <div className="flex flex-col gap-2">
      {linked.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {linked.map((collection) => (
            <LinkChip
              key={collection.id}
              href={`${libraryHref}/collections/${collection.id}`}
              label={collection.name}
              removeLabel={`Remove from ${collection.name}`}
              onRemove={() => void run(() => removeFromCollectionAction({ collectionId: collection.id, referenceId }))}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[0.8125rem] text-fg-faint">Not in any collection.</p>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="w-fit">
            <FolderPlus aria-hidden className="size-3.5" />
            Add to collection
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          {available.length > 0 ? <DropdownMenuLabel>Add to</DropdownMenuLabel> : null}
          {available.map((collection) => (
            <DropdownMenuItem key={collection.id} onSelect={() => void run(() => addToCollectionAction({ collectionId: collection.id, referenceIds: [referenceId] }))}>
              {collection.name}
            </DropdownMenuItem>
          ))}
          {available.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            New collection…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ErrorText message={error} />
      <CollectionFormDialog open={createOpen} onOpenChange={setCreateOpen} mode={{ kind: "create", workspaceId, referenceIds: [referenceId] }} />
    </div>
  );
}

export function ReferenceProjects({
  referenceId,
  linked,
  choices,
  projectsHref,
}: {
  referenceId: string;
  linked: LinkedProject[];
  choices: { id: string; name: string; archived: boolean }[];
  projectsHref: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const available = choices.filter((choice) => !choice.archived && !linked.some((project) => project.id === choice.id));

  async function run(work: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    const result = await work();
    if (!result.ok) setError(result.message ?? "Something went wrong.");
  }

  return (
    <div className="flex flex-col gap-2">
      {linked.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {linked.map((project) =>
            project.archived ? (
              <li key={project.id} className="flex items-center gap-2 rounded-sm border border-line-subtle bg-surface px-2.5 py-1.5 text-[0.8125rem]">
                <Link href={`${projectsHref}/${project.id}/references`} className="min-w-0 flex-1 truncate text-fg-muted hover:text-accent">
                  {project.name}
                </Link>
                <span className="inline-flex items-center gap-1 text-[0.6875rem] text-fg-faint" title="Archived projects are read-only">
                  <Archive aria-hidden className="size-3" />
                  Archived
                </span>
              </li>
            ) : (
              <LinkChip
                key={project.id}
                href={`${projectsHref}/${project.id}/references`}
                label={project.name}
                removeLabel={`Unlink from ${project.name}`}
                onRemove={() => void run(() => unlinkReferenceFromProjectAction({ projectId: project.id, referenceId }))}
              />
            ),
          )}
        </ul>
      ) : (
        <p className="text-[0.8125rem] text-fg-faint">Not linked to a project.</p>
      )}
      {available.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="w-fit">
              <Link2 aria-hidden className="size-3.5" />
              Link to project
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Link to</DropdownMenuLabel>
            {available.map((project) => (
              <DropdownMenuItem key={project.id} onSelect={() => void run(() => linkReferencesToProjectAction({ projectId: project.id, referenceIds: [referenceId] }))}>
                {project.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <ErrorText message={error} />
    </div>
  );
}
