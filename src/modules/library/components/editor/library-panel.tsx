"use client";

import { useState } from "react";
import { ImageUp, Search, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import type { BoardImage } from "../../domain/moodboard";
import { useReferenceSearch } from "../reference-picker";
import { UploadButton } from "../upload/upload-controls";

/** The data type carried when dragging a reference from the panel onto the canvas. */
export const REFERENCE_DRAG_TYPE = "application/x-framework-reference";

/**
 * The library, beside the canvas. Click a reference to place it in the middle
 * of the view, or drag it to a spot. Dropping image files on the canvas
 * uploads them to the library and places them where they were dropped.
 */
export function LibraryPanel({ workspaceId, onAdd, onClose }: { workspaceId: string; onAdd: (image: BoardImage) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const search = useReferenceSearch({ workspaceId }, query.replace(/\s+/g, " ").trim());

  return (
    <aside aria-label="Add from the library" className="flex h-full w-72 shrink-0 flex-col border-l border-line-subtle bg-surface animate-fade-in">
      <div className="flex h-12 items-center gap-2 border-b border-line-subtle pl-4 pr-2">
        <h2 className="flex-1 text-[0.8125rem] font-medium text-fg">Library</h2>
        <Button size="icon" variant="ghost" aria-label="Close the library panel" onClick={onClose} className="size-7">
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-b border-line-subtle p-3">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
          <Input type="search" aria-label="Search the library" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 pl-8 text-[0.8125rem]" />
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-fg-faint">Click to add, or drag onto the canvas.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {search.items.length === 0 && !search.loading ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-[0.8125rem] text-fg-muted">
            {search.error ?? (query ? "Nothing matches." : "The library is empty.")}
            {!query ? (
              <UploadButton target={{ workspaceId }} size="sm">
                Upload images
              </UploadButton>
            ) : null}
          </div>
        ) : (
          <ul aria-label="Library references" className="columns-2 gap-2">
            {search.items.map((item) => {
              const image: BoardImage = { id: item.id, title: item.title, width: item.width, height: item.height, dominantColor: item.dominantColor };
              return (
                <li key={item.id} className="mb-2 break-inside-avoid">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(REFERENCE_DRAG_TYPE, JSON.stringify(image));
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onAdd(image)}
                    aria-label={`Add ${item.title} to the board`}
                    title={item.title}
                    className="block w-full cursor-grab overflow-hidden rounded-sm ring-1 ring-inset ring-transparent transition-shadow hover:ring-accent active:cursor-grabbing"
                    style={{ aspectRatio: `${item.width} / ${Math.min(item.height, item.width * 2)}`, backgroundColor: item.dominantColor }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, pre-sized derivative */}
                    <img src={`/api/library/files/${item.id}/thumb`} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {search.loading ? (
          <div className="flex justify-center py-3">
            <Spinner className="text-fg-faint" label="Loading" />
          </div>
        ) : search.hasMore ? (
          <Button variant="ghost" size="sm" className="w-full" onClick={search.loadMore}>
            Show more
          </Button>
        ) : null}
      </div>
      <div className="border-t border-line-subtle p-3">
        <p className="flex items-center gap-2 text-[0.6875rem] text-fg-faint">
          <ImageUp aria-hidden className="size-3.5" />
          Drop image files on the canvas to upload and place them.
        </p>
      </div>
    </aside>
  );
}
