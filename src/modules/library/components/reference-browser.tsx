"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { setFavoriteAction } from "../actions";
import { LAYOUTS, filtersToQuery, hasActiveFilters, type LibraryFilters, type ReferenceListItem } from "../domain/reference";
import { BulkActions } from "./bulk-actions";
import { LibraryFilterBar } from "./library-filter-bar";
import { ReferenceGrid } from "./reference-grid";
import { useLocalPreference } from "./use-local-preference";
import type { ReferencePage } from "../server/reference-repository";

type Scope = {
  workspaceId: string;
  workspaceSlug: string;
  /** Set on a collection page: the collection filter is implied by the route. */
  collectionId?: string;
  /** Set on a project's References tab: only that project's references. */
  projectId?: string;
};

/**
 * The browsing surface shared by the library, a collection and a project's
 * references. The server renders the first page for the current filters; more
 * pages are fetched as you scroll. When the filters change, the server's new
 * first page replaces everything, and any request for the old filters is
 * aborted, so a slow answer can never overwrite a newer one.
 */
export function ReferenceBrowser({
  scope,
  filters,
  filtersKey,
  initial,
  tags,
  collections,
  projects,
  empty,
  noMatches,
  renderMenu,
  bulkExtra,
  showFilters = true,
}: {
  scope: Scope;
  filters: LibraryFilters;
  filtersKey: string;
  initial: ReferencePage;
  tags: { id: string; name: string; count: number }[];
  collections: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  empty: ReactNode;
  noMatches: ReactNode;
  renderMenu?: (reference: ReferenceListItem) => ReactNode;
  bulkExtra?: (selectedIds: string[], clear: () => void) => ReactNode;
  showFilters?: boolean;
}) {
  const [layout, setLayout] = useLocalPreference("fw:library-layout", LAYOUTS, "masonry");
  const [extra, setExtra] = useState<{ key: string; items: ReferenceListItem[]; cursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Map<string, boolean>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Pages loaded for other filters are discarded, and their requests cancelled.
  const pages = extra && extra.key === filtersKey ? extra : null;
  const [seenKey, setSeenKey] = useState(filtersKey);
  if (seenKey !== filtersKey) {
    setSeenKey(filtersKey);
    setLoading(false);
    setLoadError(null);
    setSelected(new Set());
  }
  useEffect(() => () => abort.current?.abort(), [filtersKey]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const merged: ReferenceListItem[] = [];
    for (const item of [...initial.items, ...(pages?.items ?? [])]) {
      if (seen.has(item.id) || hidden.has(item.id)) continue;
      seen.add(item.id);
      const favorite = favorites.get(item.id);
      merged.push(favorite === undefined || favorite === item.favorite ? item : { ...item, favorite });
    }
    return merged;
  }, [initial.items, pages, favorites, hidden]);

  const cursor = pages ? pages.cursor : initial.nextCursor;

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setLoading(true);
    setLoadError(null);
    const query = new URLSearchParams(filtersToQuery(filters).slice(1));
    query.set("workspace", scope.workspaceId);
    query.set("cursor", cursor);
    if (scope.collectionId) query.set("collection", scope.collectionId);
    if (scope.projectId) query.set("project", scope.projectId);
    const key = filtersKey;
    try {
      const response = await fetch(`/api/library/references?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as ReferencePage;
      setExtra((current) => ({
        key,
        items: [...(current && current.key === key ? current.items : []), ...page.items],
        cursor: page.nextCursor,
      }));
    } catch (error) {
      if ((error as Error).name !== "AbortError") setLoadError("More references could not be loaded.");
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setLoading(false);
      }
    }
  }, [cursor, loading, filters, filtersKey, scope.workspaceId, scope.collectionId, scope.projectId]);

  // Load ahead of the reader: the shell scrolls <main>, so that is the observer's root.
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !cursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root: document.getElementById("main"), rootMargin: "1200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  useEffect(() => () => abort.current?.abort(), []);

  const toggleSelect = useCallback(
    (reference: ReferenceListItem, range: boolean) => {
      setSelected((current) => {
        const next = new Set(current);
        if (range && anchor.current) {
          const from = items.findIndex((item) => item.id === anchor.current);
          const to = items.findIndex((item) => item.id === reference.id);
          if (from >= 0 && to >= 0) {
            for (const item of items.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(item.id);
            return next;
          }
        }
        if (next.has(reference.id)) next.delete(reference.id);
        else next.add(reference.id);
        anchor.current = reference.id;
        return next;
      });
    },
    [items],
  );

  const toggleFavorite = useCallback(async (reference: ReferenceListItem) => {
    const next = !reference.favorite;
    setFavorites((current) => new Map(current).set(reference.id, next));
    const result = await setFavoriteAction({ referenceId: reference.id, favorite: next });
    if (!result.ok) setFavorites((current) => new Map(current).set(reference.id, !next));
  }, []);

  // Escape clears the selection; Ctrl/⌘+A selects everything loaded (outside text fields).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role='dialog'], [role='menu']")) return;
      if (event.key === "Escape" && selected.size > 0) setSelected(new Set());
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && items.length > 0) {
        event.preventDefault();
        setSelected(new Set(items.map((item) => item.id)));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, selected.size]);

  const hrefFor = useCallback((reference: ReferenceListItem) => `/w/${scope.workspaceSlug}/library/r/${reference.id}`, [scope.workspaceSlug]);
  const selectedIds = useMemo(() => [...selected], [selected]);
  const clear = useCallback(() => setSelected(new Set()), []);
  const total = initial.total ?? items.length;
  const neverAnything = total === 0 && !hasActiveFilters(filters, Boolean(scope.collectionId));

  if (neverAnything) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-4">
      {showFilters ? (
        <LibraryFilterBar
          filters={filters}
          tags={tags}
          collections={collections}
          layout={layout}
          onLayoutChange={setLayout}
          collectionLocked={Boolean(scope.collectionId)}
        />
      ) : null}
      <p role="status" className="-mb-1 text-xs text-fg-faint">
        {total} {total === 1 ? "reference" : "references"}
        {hasActiveFilters(filters, Boolean(scope.collectionId)) ? " match" : ""}
      </p>

      {items.length === 0 ? (
        noMatches
      ) : (
        <ReferenceGrid
          items={items}
          layout={layout}
          hrefFor={hrefFor}
          selected={selected}
          selecting={selected.size > 0}
          onToggleSelect={toggleSelect}
          onToggleFavorite={toggleFavorite}
          renderMenu={renderMenu}
        />
      )}

      <div ref={sentinel} aria-hidden className="h-px" />
      {cursor ? (
        <div className="flex justify-center py-2">
          {loading ? (
            <Spinner className="text-fg-faint" label="Loading more references" />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => void loadMore()}>
              {loadError ? `${loadError} Try again` : "Load more"}
            </Button>
          )}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <BulkActions
          workspaceId={scope.workspaceId}
          selectedIds={selectedIds}
          collections={collections}
          projects={projects}
          onClear={clear}
          onDeleted={(ids) => {
            setHidden((current) => new Set([...current, ...ids]));
            clear();
          }}
          extra={bulkExtra?.(selectedIds, clear)}
        />
      ) : null}
    </div>
  );
}

