"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Columns3, LayoutGrid, List, Search, Tags, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Select } from "@/shared/ui/select";
import { Spinner } from "@/shared/ui/spinner";
import {
  DEFAULT_FILTERS,
  LIMITS,
  SORTS,
  SORT_LABEL,
  VIEWS,
  VIEW_LABEL,
  filtersToQuery,
  hasActiveFilters,
  type Layout,
  type LibraryFilters,
  type TagCount,
  type View,
} from "../domain/reference";

const SEARCH_DELAY_MS = 250;

const LAYOUT_OPTIONS = [
  { value: "masonry" as const, label: "Masonry", icon: <Columns3 aria-hidden /> },
  { value: "grid" as const, label: "Grid", icon: <LayoutGrid aria-hidden /> },
  { value: "list" as const, label: "List", icon: <List aria-hidden /> },
];

/**
 * Filters live in the URL, so a view can be linked, reloaded and navigated
 * back to. When `collectionLocked` is set the route already implies a
 * collection, so that filter is hidden and kept out of the query string.
 */
export function LibraryFilterBar({
  filters,
  tags,
  collections,
  layout,
  onLayoutChange,
  collectionLocked = false,
}: {
  filters: LibraryFilters;
  tags: TagCount[];
  collections: { id: string; name: string }[];
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  collectionLocked?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(filters.q);
  const lastSent = useRef(filters.q);
  const [navigating, startNavigation] = useTransition();

  // The filters most recently *asked for*. Props only catch up once the server
  // has answered, so quick successive changes must build on this, not on props.
  const latest = useRef(filters);
  useEffect(() => {
    if (!navigating) latest.current = filters;
  }, [filters, navigating]);

  function navigate(next: LibraryFilters) {
    latest.current = next;
    startNavigation(() => {
      router.replace(`${pathname}${filtersToQuery(next, { collection: collectionLocked })}`, { scroll: false });
    });
  }

  const go = (patch: Partial<LibraryFilters>) => navigate({ ...latest.current, ...patch });

  // Back/forward or "Clear" changes the URL under us; follow it unless it is our own echo.
  useEffect(() => {
    if (filters.q !== lastSent.current) {
      lastSent.current = filters.q;
      setSearch(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    const trimmed = search.replace(/\s+/g, " ").trim();
    if (trimmed === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = trimmed;
      navigate({ ...latest.current, q: trimmed });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // `navigate` only reads refs and stable values; re-arming on its identity would restart the delay every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pathname, router]);

  const viewOptions = useMemo(() => VIEWS.map((view) => ({ value: view, label: VIEW_LABEL[view] })), []);
  const active = hasActiveFilters(filters, collectionLocked);

  return (
    <div role="search" aria-label="Filter references" className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
          <Input
            type="search"
            aria-label="Search references"
            placeholder="Search titles, descriptions and filenames"
            value={search}
            maxLength={LIMITS.search}
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9 pr-9"
          />
          {navigating ? <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint" label="Updating results" /> : null}
        </div>
        <SegmentedControl aria-label="Layout" value={layout} options={LAYOUT_OPTIONS} onValueChange={onLayoutChange} className="hidden shrink-0 sm:inline-flex [&_button]:px-2" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full overflow-x-auto sm:w-auto">
          <SegmentedControl aria-label="Show" value={filters.view} options={viewOptions} onValueChange={(view: View) => go({ view })} />
        </div>
        <TagFilter tags={tags} selected={filters.tags} onChange={(next) => go({ tags: next })} />
        {collectionLocked ? null : (
          <div className="w-44">
            <Select aria-label="Collection" value={filters.collection ?? ""} onChange={(event) => go({ collection: event.target.value || null })}>
              <option value="">All collections</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-40">
          <Select aria-label="Sort by" value={filters.sort} onChange={(event) => go({ sort: event.target.value as LibraryFilters["sort"] })}>
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABEL[sort]}
              </option>
            ))}
          </Select>
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              lastSent.current = "";
              setSearch("");
              navigate({ ...DEFAULT_FILTERS, sort: latest.current.sort, collection: collectionLocked ? latest.current.collection : null });
            }}
          >
            <X aria-hidden className="size-3.5" />
            Clear filters
          </Button>
        ) : null}
      </div>

      {filters.tags.length > 0 ? (
        <ul aria-label="Filtering by tags" className="flex flex-wrap gap-1.5">
          {filters.tags.map((tag) => (
            <li key={tag.toLowerCase()}>
              <button
                type="button"
                onClick={() => go({ tags: latest.current.tags.filter((existing) => existing.toLowerCase() !== tag.toLowerCase()) })}
                aria-label={`Stop filtering by ${tag}`}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-accent-line bg-accent-soft pl-2.5 pr-1.5 text-xs font-medium text-accent transition-colors hover:border-accent"
              >
                {tag}
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A searchable list of tags with checkboxes. Selecting several narrows to references with all of them. */
function TagFilter({ tags, selected, onChange }: { tags: TagCount[]; selected: string[]; onChange: (tags: string[]) => void }) {
  const [query, setQuery] = useState("");
  const chosen = new Set(selected.map((tag) => tag.toLowerCase()));
  const visible = tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(name: string) {
    const key = name.toLowerCase();
    onChange(chosen.has(key) ? selected.filter((tag) => tag.toLowerCase() !== key) : [...selected, name].slice(0, LIMITS.tagsPerFilter));
  }

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger asChild>
        <Button variant="secondary" className={cn(selected.length > 0 && "border-accent-line text-accent")}>
          <Tags aria-hidden className="size-3.5" />
          Tags
          {selected.length > 0 ? <span className="font-mono text-[0.6875rem]">{selected.length}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <div className="border-b border-line-subtle p-2">
          <Input
            autoFocus
            aria-label="Find a tag"
            placeholder="Find a tag…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 text-[0.8125rem]"
          />
        </div>
        <ul role="group" aria-label="Tags" className="max-h-64 overflow-y-auto overscroll-contain p-1">
          {visible.length === 0 ? (
            <li className="px-2.5 py-6 text-center text-[0.8125rem] text-fg-faint">{tags.length === 0 ? "No tags yet. Add them from a reference." : "No tags match."}</li>
          ) : (
            visible.map((tag) => {
              const checked = chosen.has(tag.name.toLowerCase());
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(tag.name)}
                    className="flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-[0.8125rem] text-fg hover:bg-active focus-visible:bg-active focus-visible:outline-none"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-xs border transition-colors",
                        checked ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                      )}
                    >
                      {checked ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    <span className="font-mono text-[0.6875rem] text-fg-faint">{tag.count}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {selected.length > 0 ? (
          <div className="border-t border-line-subtle p-1">
            <button type="button" onClick={() => onChange([])} className="h-8 w-full rounded-sm px-2 text-left text-[0.8125rem] text-fg-muted hover:bg-active hover:text-fg">
              Clear tag filter
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
