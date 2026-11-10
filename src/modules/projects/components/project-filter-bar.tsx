"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Select } from "@/shared/ui/select";
import {
  LIMITS,
  SORTS,
  SORT_LABEL,
  DEFAULT_FILTERS,
  filtersToQuery,
  hasActiveFilters,
  type ProjectCategory,
  type ProjectFilters,
  type ProjectStatus,
  type TagCount,
  type View,
} from "../domain/project";

const SEARCH_DELAY_MS = 300;

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

/** Filters live in the URL, so a view can be linked, reloaded and navigated back to. */
export function ProjectFilterBar({
  filters,
  statuses,
  categories,
  tags,
}: {
  filters: ProjectFilters;
  statuses: ProjectStatus[];
  categories: ProjectCategory[];
  tags: TagCount[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(filters.q);
  const lastSent = useRef(filters.q);
  const [navigating, startNavigation] = useTransition();

  // The filters most recently *asked for*. Props only catch up once the server has answered, so two
  // quick changes (two dropdowns, or typing then picking) must build on this, not on stale props.
  const latest = useRef(filters);
  useEffect(() => {
    if (!navigating) latest.current = filters;
  }, [filters, navigating]);

  function navigate(next: ProjectFilters) {
    latest.current = next;
    startNavigation(() => {
      router.replace(`${pathname}${filtersToQuery(next)}`, { scroll: false });
    });
  }

  function go(next: Partial<ProjectFilters>) {
    // Any change to what is being looked at starts again from the first page.
    navigate({ ...latest.current, page: 1, ...next });
  }

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
      navigate({ ...latest.current, q: trimmed, page: 1 });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // `navigate` only reads refs and stable values; re-arming on its identity would restart the delay every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pathname, router]);

  return (
    <div role="search" aria-label="Filter projects" className="flex flex-col gap-3">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
        <Input
          type="search"
          aria-label="Search projects"
          placeholder="Search by name, client or description"
          value={search}
          maxLength={LIMITS.search}
          autoComplete="off"
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        <div className="sm:w-40">
          <Select aria-label="Status" value={filters.status ?? ""} onChange={(event) => go({ status: event.target.value || null })}>
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:w-44">
          <Select aria-label="Category" value={filters.category ?? ""} onChange={(event) => go({ category: event.target.value || null })}>
            <option value="">All categories</option>
            <option value="none">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:w-40">
          <Select aria-label="Tag" value={filters.tag ?? ""} onChange={(event) => go({ tag: event.target.value || null })}>
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name} ({tag.count})
              </option>
            ))}
            {/* A linked tag that no project uses any more still needs to be shown as selected. */}
            {filters.tag && !tags.some((tag) => tag.name.toLowerCase() === filters.tag!.toLowerCase()) ? (
              <option value={filters.tag}>{filters.tag}</option>
            ) : null}
          </Select>
        </div>
        <div className="sm:w-44">
          <Select aria-label="Sort by" value={filters.sort} onChange={(event) => go({ sort: event.target.value as ProjectFilters["sort"] })}>
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABEL[sort]}
              </option>
            ))}
          </Select>
        </div>
        <SegmentedControl
          aria-label="Show"
          value={filters.view}
          options={VIEW_OPTIONS}
          onValueChange={(view) => go({ view })}
          className="col-span-2 justify-self-start sm:ml-auto"
        />
        {hasActiveFilters(filters) ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              lastSent.current = "";
              setSearch("");
              navigate({ ...DEFAULT_FILTERS, sort: latest.current.sort });
            }}
          >
            <X aria-hidden className="size-3.5" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
