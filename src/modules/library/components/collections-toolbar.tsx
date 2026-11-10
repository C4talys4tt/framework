"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { COLLECTION_SORTS, COLLECTION_SORT_LABEL, type CollectionSort } from "../domain/reference";
import { CollectionFormDialog } from "./collection-form-dialog";

function query(q: string, sort: CollectionSort) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort !== "updated") params.set("sort", sort);
  return params.size ? `?${params}` : "";
}

export function CollectionsToolbar({ q, sort }: { q: string; sort: CollectionSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(q);
  const latest = useRef({ q, sort });
  const [, startTransition] = useTransition();

  useEffect(() => {
    latest.current = { q, sort };
  }, [q, sort]);

  function go(next: { q: string; sort: CollectionSort }) {
    latest.current = next;
    startTransition(() => router.replace(`${pathname}${query(next.q, next.sort)}`, { scroll: false }));
  }

  useEffect(() => {
    const trimmed = search.replace(/\s+/g, " ").trim();
    if (trimmed === latest.current.q) return;
    const timer = setTimeout(() => go({ ...latest.current, q: trimmed }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div role="search" aria-label="Filter collections" className="flex flex-wrap gap-2">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
        <Input type="search" aria-label="Search collections" placeholder="Search collections" value={search} maxLength={80} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
      </div>
      <div className="w-48">
        <Select aria-label="Sort collections" value={sort} onChange={(event) => go({ ...latest.current, sort: event.target.value as CollectionSort })}>
          {COLLECTION_SORTS.map((option) => (
            <option key={option} value={option}>
              {COLLECTION_SORT_LABEL[option]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/** Opens the create dialog; `autoOpen` handles `?new=1` from the command palette. */
export function NewCollectionButton({ workspaceId, base, autoOpen = false, label = "New collection" }: { workspaceId: string; base: string; autoOpen?: boolean; label?: string }) {
  const [open, setOpen] = useState(autoOpen);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (autoOpen) router.replace(pathname, { scroll: false });
  }, [autoOpen, pathname, router]);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-3.5" />
        {label}
      </Button>
      <CollectionFormDialog open={open} onOpenChange={setOpen} mode={{ kind: "create", workspaceId }} onSaved={(_, id) => router.push(`${base}/collections/${id}`)} />
    </>
  );
}
