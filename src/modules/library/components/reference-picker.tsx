"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImageOff, Search } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import type { ReferenceListItem } from "../domain/reference";

export type PickerSource = {
  workspaceId: string;
  /** Hide references already in this collection / linked to this project. */
  excludeCollection?: string;
  excludeProject?: string;
};

type Page = { items: ReferenceListItem[]; nextCursor: string | null };

/**
 * Searching and paging the library from anywhere. Each new search aborts the
 * previous request, so results always match what is typed.
 */
export function useReferenceSearch(source: PickerSource, query: string, enabled = true) {
  const [items, setItems] = useState<ReferenceListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (after: string | null, replace: boolean) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ workspace: source.workspaceId, limit: "60" });
      if (query) params.set("q", query);
      if (after) params.set("cursor", after);
      if (source.excludeCollection) params.set("excludeCollection", source.excludeCollection);
      if (source.excludeProject) params.set("excludeProject", source.excludeProject);
      try {
        const response = await fetch(`/api/library/references?${params}`, { signal: current.signal });
        if (!response.ok) throw new Error(String(response.status));
        const page = (await response.json()) as Page;
        setItems((existing) => (replace ? page.items : [...existing, ...page.items]));
        setCursor(page.nextCursor);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") setError("The library could not be loaded. Try again.");
      } finally {
        if (controller.current === current) setLoading(false);
      }
    },
    [source.workspaceId, source.excludeCollection, source.excludeProject, query],
  );

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => void fetchPage(null, true), query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [enabled, fetchPage, query]);

  useEffect(() => () => controller.current?.abort(), []);

  return { items, loading, error, hasMore: cursor !== null, loadMore: () => void fetchPage(cursor, false), reload: () => void fetchPage(null, true) };
}

export function ReferencePickerDialog({
  open,
  onOpenChange,
  source,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: PickerSource;
  title: string;
  description?: string;
  confirmLabel: (count: number) => string;
  onConfirm: (referenceIds: string[]) => Promise<string | undefined>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} size="lg" className="max-w-4xl">
        {open ? <PickerBody source={source} confirmLabel={confirmLabel} onConfirm={onConfirm} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  source,
  confirmLabel,
  onConfirm,
  onDone,
}: {
  source: PickerSource;
  confirmLabel: (count: number) => string;
  onConfirm: (referenceIds: string[]) => Promise<string | undefined>;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const search = useReferenceSearch(source, query.replace(/\s+/g, " ").trim());

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));
  }

  async function confirm() {
    setPending(true);
    setError(undefined);
    try {
      const message = await onConfirm(selected);
      if (message) setError(message);
      else onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
        <Input type="search" aria-label="Search the library" placeholder="Search the library" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" data-autofocus />
      </div>
      <div className="min-h-64">
        {search.items.length === 0 && !search.loading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-[0.8125rem] text-fg-muted">
            <ImageOff aria-hidden className="size-5 text-fg-faint" />
            {search.error ?? (query ? "Nothing in the library matches." : "Everything in the library is already here.")}
          </div>
        ) : (
          <ul aria-label="Library references" className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
            {search.items.map((item) => {
              const checked = selected.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={item.title}
                    onClick={() => toggle(item.id)}
                    className={cn(
                      "group relative block w-full overflow-hidden rounded-md ring-1 ring-inset transition-[box-shadow]",
                      checked ? "ring-2 ring-accent" : "ring-transparent hover:ring-line-strong",
                    )}
                  >
                    <ImageTile item={item} />
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full border transition-colors",
                        checked ? "border-accent bg-accent text-on-accent" : "border-white/50 bg-black/30 text-transparent",
                      )}
                    >
                      <Check className="size-3" strokeWidth={2.5} />
                    </span>
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[0.6875rem] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {item.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {search.loading ? (
          <div className="flex justify-center py-4">
            <Spinner className="text-fg-faint" label="Loading" />
          </div>
        ) : search.hasMore ? (
          <div className="flex justify-center pt-3">
            <Button variant="ghost" size="sm" onClick={search.loadMore}>
              Show more
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
        {selected.length > 0 ? (
          <button type="button" className="mr-auto text-xs text-fg-muted hover:text-fg" onClick={() => setSelected([])}>
            Clear {selected.length} selected
          </button>
        ) : null}
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button variant="primary" disabled={selected.length === 0} pending={pending} onClick={confirm}>
          {confirmLabel(selected.length)}
        </Button>
      </div>
    </div>
  );
}

function ImageTile({ item }: { item: ReferenceListItem }) {
  // Imported lazily-styled tile; square crop keeps the picker dense.
  return (
    <span className="block aspect-square w-full" style={{ backgroundColor: item.dominantColor }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, pre-sized derivative */}
      <img src={`/api/library/files/${item.id}/thumb`} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
    </span>
  );
}
