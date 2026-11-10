"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Check, Star } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { LocalDate } from "@/shared/ui/local-date";
import { TYPE_LABEL, formatBytes } from "../domain/files";
import type { Layout, ReferenceListItem } from "../domain/reference";
import { ReferenceImage } from "./reference-image";

export type CardHandlers = {
  hrefFor: (reference: ReferenceListItem) => string;
  selected: ReadonlySet<string>;
  selecting: boolean;
  onToggleSelect: (reference: ReferenceListItem, range: boolean) => void;
  onToggleFavorite: (reference: ReferenceListItem) => void;
  /** Extra per-card controls (collection cover, remove from project...). */
  renderMenu?: (reference: ReferenceListItem) => ReactNode;
};

const GAP = 12;

/** Column count for a container width. */
function columnsFor(width: number): number {
  if (width < 520) return 2;
  return Math.max(2, Math.min(7, Math.floor((width + GAP) / (240 + GAP))));
}

/** Very tall or very wide images are cropped in the masonry so no single tile dominates. */
const clampRatio = (reference: ReferenceListItem) => Math.min(2.4, Math.max(0.42, reference.height / Math.max(1, reference.width)));

export function ReferenceGrid({ items, layout, ...handlers }: { items: ReferenceListItem[]; layout: Layout } & CardHandlers) {
  if (layout === "list") return <ReferenceList items={items} {...handlers} />;
  if (layout === "grid") {
    return (
      <ul aria-label="References" className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <ReferenceCard reference={item} ratio={1} {...handlers} />
          </li>
        ))}
      </ul>
    );
  }
  return <Masonry items={items} {...handlers} />;
}

/**
 * Shortest-column placement from the stored dimensions, so nothing jumps as
 * images load. Tiles are positioned absolutely but stay in their original DOM
 * order, so keyboard and screen-reader order is the sort order (unlike CSS
 * columns, which read down each column). Until the width is known (first
 * paint from the server) a CSS-columns approximation is shown.
 */
function Masonry({ items, ...handlers }: { items: ReferenceListItem[] } & CardHandlers) {
  const container = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (width === 0) return null;
    const columns = columnsFor(width);
    const columnWidth = (width - GAP * (columns - 1)) / columns;
    const heights = Array.from({ length: columns }, () => 0);
    const positions = items.map((item) => {
      let lane = 0;
      for (let index = 1; index < columns; index += 1) if (heights[index]! < heights[lane]! - 0.5) lane = index;
      const top = heights[lane]!;
      const height = Math.round(columnWidth * clampRatio(item));
      heights[lane] = top + height + GAP;
      return { left: lane * (columnWidth + GAP), top, width: columnWidth, height };
    });
    return { positions, height: Math.max(0, ...heights) - GAP };
  }, [items, width]);

  return (
    <ul
      ref={container}
      aria-label="References"
      className={cn("relative", layout ? null : "columns-[14rem] gap-3 [&>li]:mb-3")}
      style={layout ? { height: Math.max(0, layout.height) } : undefined}
    >
      {items.map((item, index) => {
        const position = layout?.positions[index];
        return (
          <li
            key={item.id}
            className={position ? "absolute" : "break-inside-avoid"}
            style={position ? { left: position.left, top: position.top, width: position.width } : undefined}
          >
            <ReferenceCard reference={item} ratio={clampRatio(item)} {...handlers} />
          </li>
        );
      })}
    </ul>
  );
}

export const ReferenceCard = memo(function ReferenceCard({
  reference,
  ratio,
  hrefFor,
  selected,
  selecting,
  onToggleSelect,
  onToggleFavorite,
  renderMenu,
}: { reference: ReferenceListItem; ratio: number } & CardHandlers) {
  const isSelected = selected.has(reference.id);

  function onClick(event: MouseEvent) {
    // In selection mode (or with Shift), a click selects instead of opening.
    if (selecting || event.shiftKey) {
      event.preventDefault();
      onToggleSelect(reference, event.shiftKey);
    }
  }

  return (
    <div className="group relative" data-reference-id={reference.id}>
      <Link
        href={hrefFor(reference)}
        onClick={onClick}
        aria-label={reference.title}
        className={cn(
          "block overflow-hidden rounded-md outline-offset-2 ring-1 ring-inset ring-transparent transition-[box-shadow] duration-150",
          isSelected ? "ring-2 ring-accent" : "hover:ring-line-strong",
        )}
      >
        <ReferenceImage
          referenceId={reference.id}
          alt=""
          dominantColor={reference.dominantColor}
          className="w-full transition-transform duration-500 ease-out-quint group-hover:scale-[1.015]"
          style={{ aspectRatio: `1 / ${ratio}` }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2.5 pb-2 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <span className="truncate text-xs font-medium text-white">{reference.title}</span>
        </span>
        {isSelected ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-md bg-accent/10" /> : null}
      </Link>

      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={`Select ${reference.title}`}
        onClick={(event) => onToggleSelect(reference, event.shiftKey)}
        className={cn(
          "absolute left-2 top-2 grid size-6 place-items-center rounded-full border shadow-raised backdrop-blur transition-[opacity,background-color,border-color] duration-150",
          isSelected ? "border-accent bg-accent text-on-accent opacity-100" : "border-white/40 bg-black/35 text-transparent hover:text-white/80",
          selecting || isSelected ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
        )}
      >
        <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
      </button>

      <div
        className={cn(
          "absolute right-2 top-2 flex items-center gap-1 transition-opacity duration-150",
          reference.favorite ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        {renderMenu ? <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">{renderMenu(reference)}</span> : null}
        <button
          type="button"
          aria-pressed={reference.favorite}
          aria-label={reference.favorite ? `Remove ${reference.title} from favorites` : `Add ${reference.title} to favorites`}
          onClick={() => onToggleFavorite(reference)}
          className="grid size-7 place-items-center rounded-full bg-black/35 text-white shadow-raised backdrop-blur transition-colors hover:bg-black/55"
        >
          <Star aria-hidden className={cn("size-3.5", reference.favorite && "fill-hue-amber text-hue-amber")} />
        </button>
      </div>
    </div>
  );
});

function ReferenceList({ items, hrefFor, selected, selecting, onToggleSelect, onToggleFavorite, renderMenu }: { items: ReferenceListItem[] } & CardHandlers) {
  return (
    <ul aria-label="References" className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line-subtle bg-surface shadow-raised">
      {items.map((reference) => {
        const isSelected = selected.has(reference.id);
        return (
          <li key={reference.id} className={cn("group relative flex items-center gap-3 px-3 py-2 transition-colors", isSelected ? "bg-accent-soft" : "hover:bg-hover")}>
            <button
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={`Select ${reference.title}`}
              onClick={(event) => onToggleSelect(reference, event.shiftKey)}
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-xs border transition-colors",
                isSelected ? "border-accent bg-accent text-on-accent" : "border-line-strong text-transparent",
              )}
            >
              <Check aria-hidden className="size-3" strokeWidth={2.5} />
            </button>
            <ReferenceImage referenceId={reference.id} alt="" dominantColor={reference.dominantColor} className="size-12 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1">
              <Link
                href={hrefFor(reference)}
                onClick={(event) => {
                  if (selecting || event.shiftKey) {
                    event.preventDefault();
                    onToggleSelect(reference, event.shiftKey);
                  }
                }}
                className="block truncate text-[0.8125rem] font-medium text-fg after:absolute after:inset-0 hover:text-accent"
              >
                {reference.title}
              </Link>
              {reference.tags.length > 0 ? <p className="truncate text-xs text-fg-faint">{reference.tags.join(" · ")}</p> : null}
            </div>
            <span className="hidden w-24 shrink-0 text-right font-mono text-[0.6875rem] text-fg-faint md:block">
              {reference.width}×{reference.height}
            </span>
            <span className="hidden w-16 shrink-0 text-right font-mono text-[0.6875rem] text-fg-faint lg:block">{TYPE_LABEL[reference.mimeType]}</span>
            <span className="hidden w-16 shrink-0 text-right font-mono text-[0.6875rem] text-fg-faint sm:block">{formatBytes(reference.byteSize)}</span>
            <span className="hidden w-24 shrink-0 text-right text-xs text-fg-muted md:block">
              <LocalDate value={reference.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
            </span>
            <div className="relative z-10 flex items-center gap-1">
              {renderMenu?.(reference)}
              <button
                type="button"
                aria-pressed={reference.favorite}
                aria-label={reference.favorite ? `Remove ${reference.title} from favorites` : `Add ${reference.title} to favorites`}
                onClick={() => onToggleFavorite(reference)}
                className="grid size-7 place-items-center rounded-sm text-fg-faint transition-colors hover:bg-hover hover:text-fg"
              >
                <Star aria-hidden className={cn("size-3.5", reference.favorite && "fill-hue-amber text-hue-amber")} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
