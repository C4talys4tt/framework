"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Labelled } from "@/shared/ui/labelled";
import { LIMITS, normalizeTags, splitTagInput } from "../domain/project";

/** Chips plus a text box. Enter, comma or leaving the box adds; Backspace on an empty box removes the last. */
export function TagInput({
  label,
  value,
  onChange,
  suggestions,
  error,
}: {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const atLimit = value.length >= LIMITS.tagsPerProject;

  function commit(text: string) {
    const additions = splitTagInput(text);
    setDraft("");
    if (additions.every((entry) => entry.trim() === "")) return;
    onChange(normalizeTags([...value, ...additions]).slice(0, LIMITS.tagsPerProject));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && draft.trim() !== "") {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  const available = suggestions.filter((suggestion) => !value.some((tag) => tag.toLowerCase() === suggestion.toLowerCase()));

  return (
    <Labelled
      label={label}
      error={error}
      hint={atLimit ? `You’ve reached ${LIMITS.tagsPerProject} tags.` : "Press Enter or comma to add. Tags are shared across the workspace."}
    >
      {(control) => (
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-sm border border-line bg-canvas p-1.5 transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus-within:border-accent-line focus-within:ring-2 focus-within:ring-accent-soft aria-[invalid=true]:border-danger/60"
          aria-invalid={control["aria-invalid"]}
        >
          {value.length > 0 ? (
            <ul className="contents" aria-label="Selected tags">
              {value.map((tag) => (
                <li
                  key={tag.toLowerCase()}
                  className="inline-flex h-6 items-center gap-1 rounded-xs border border-line bg-raised pl-2 pr-1 text-xs text-fg"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => onChange(value.filter((existing) => existing !== tag))}
                    className="grid size-4 place-items-center rounded-xs text-fg-faint transition-colors hover:bg-hover hover:text-fg"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            {...control}
            value={draft}
            list={listId}
            disabled={atLimit}
            maxLength={LIMITS.tagName * 4}
            autoComplete="off"
            placeholder={value.length === 0 ? "Add a tag…" : ""}
            onChange={(event) => {
              const text = event.target.value;
              // A datalist pick or paste arrives as a whole tag; commas split it.
              if (text.includes(",") || text.includes("\n")) commit(text);
              else setDraft(text);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => commit(draft)}
            className="h-6 min-w-28 flex-1 bg-transparent px-1.5 text-sm text-fg outline-none placeholder:text-fg-faint disabled:cursor-not-allowed"
          />
          <datalist id={listId}>
            {available.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
      )}
    </Labelled>
  );
}
