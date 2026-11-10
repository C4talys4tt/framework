/**
 * Moodboard canvas maths, free of React and the DOM so it can be unit tested.
 *
 * Coordinates: elements live in "world" units. The camera maps world to
 * screen as `screen = world * zoom + offset`.
 */
import type { BoardDocument, BoardElement } from "./moodboard";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Camera = { x: number; y: number; zoom: number };

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const MIN_ELEMENT_SIZE = 16;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

export function worldToScreen(camera: Camera, point: Point): Point {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}

/** Zooms to `zoom` while keeping the world point under `anchor` (a screen point) where it is. */
export function zoomAround(camera: Camera, anchor: Point, zoom: number): Camera {
  const next = clampZoom(zoom);
  const world = screenToWorld(camera, anchor);
  return { zoom: next, x: anchor.x - world.x * next, y: anchor.y - world.y * next };
}

/** The camera that fits `bounds` inside a viewport of the given size, with padding, never above 100%. */
export function fitCamera(bounds: Rect | null, viewport: { width: number; height: number }, padding = 64): Camera {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, zoom: 1 };
  }
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const zoom = clampZoom(Math.min(1, availableWidth / bounds.width, availableHeight / bounds.height));
  return {
    zoom,
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
  };
}

export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A rectangle from two corners in any order. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// ---------------------------------------------------------------------------
// Resizing
// ---------------------------------------------------------------------------

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const CORNER_HANDLES: readonly Handle[] = ["nw", "ne", "se", "sw"];
export const ALL_HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * The rectangle after dragging `handle` by `delta` (world units). The opposite
 * edge or corner stays fixed. With `keepAspect`, corner drags preserve the
 * original proportions (edge drags always change only one dimension).
 */
export function resizeRect(rect: Rect, handle: Handle, delta: Point, keepAspect: boolean, minSize = MIN_ELEMENT_SIZE): Rect {
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");

  let width = rect.width + (east ? delta.x : west ? -delta.x : 0);
  let height = rect.height + (south ? delta.y : north ? -delta.y : 0);

  const corner = (west || east) && (north || south);
  if (keepAspect && corner && rect.width > 0 && rect.height > 0) {
    const ratio = rect.width / rect.height;
    // Follow whichever axis moved proportionally further.
    if (Math.abs(width / rect.width) > Math.abs(height / rect.height)) height = width / ratio;
    else width = height * ratio;
  }

  // Respect the minimum without flipping; scale both sides together when the aspect is kept.
  if (keepAspect && corner && rect.width > 0 && rect.height > 0) {
    const ratio = rect.width / rect.height;
    if (width < minSize || height < minSize) {
      if (ratio >= 1) {
        height = minSize;
        width = minSize * ratio;
      } else {
        width = minSize;
        height = minSize / ratio;
      }
    }
  } else {
    width = Math.max(minSize, width);
    height = Math.max(minSize, height);
  }

  return {
    x: west ? rect.x + rect.width - width : rect.x,
    y: north ? rect.y + rect.height - height : rect.y,
    width,
    height,
  };
}

/** Maps `rect` from inside `from` to the same relative place inside `to` (group resize). */
export function mapRect(rect: Rect, from: Rect, to: Rect): Rect {
  const scaleX = from.width > 0 ? to.width / from.width : 1;
  const scaleY = from.height > 0 ? to.height / from.height : 1;
  return {
    x: to.x + (rect.x - from.x) * scaleX,
    y: to.y + (rect.y - from.y) * scaleY,
    width: Math.max(1, rect.width * scaleX),
    height: Math.max(1, rect.height * scaleY),
  };
}

/** A size for a new image element: the image's proportions, its longest side `longest` units. */
export function initialImageSize(image: { width: number; height: number }, longest = 360): { width: number; height: number } {
  const ratio = image.width / Math.max(1, image.height);
  return ratio >= 1 ? { width: longest, height: Math.round(longest / ratio) } : { width: Math.round(longest * ratio), height: longest };
}

// ---------------------------------------------------------------------------
// Document operations (all return new documents; inputs are never mutated)
// ---------------------------------------------------------------------------

export function topZ(elements: readonly BoardElement[]): number {
  return elements.reduce((max, element) => Math.max(max, element.z), 0);
}

export function sortedByZ(elements: readonly BoardElement[]): BoardElement[] {
  return [...elements].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
}

export function updateElements(
  document: BoardDocument,
  ids: ReadonlySet<string>,
  change: (element: BoardElement) => BoardElement,
): BoardDocument {
  let changed = false;
  const elements = document.elements.map((element) => {
    if (!ids.has(element.id)) return element;
    const next = change(element);
    if (next !== element) changed = true;
    return next;
  });
  return changed ? { ...document, elements } : document;
}

export function moveElements(document: BoardDocument, ids: ReadonlySet<string>, delta: Point): BoardDocument {
  if (delta.x === 0 && delta.y === 0) return document;
  return updateElements(document, ids, (element) => ({ ...element, x: element.x + delta.x, y: element.y + delta.y }));
}

export function removeElements(document: BoardDocument, ids: ReadonlySet<string>): BoardDocument {
  const elements = document.elements.filter((element) => !ids.has(element.id));
  return elements.length === document.elements.length ? document : { ...document, elements };
}

/** Copies the elements, offset so the copies are visible, stacked above everything. Returns the copies' ids. */
export function duplicateElements(
  document: BoardDocument,
  ids: ReadonlySet<string>,
  newId: () => string,
  offset: Point = { x: 24, y: 24 },
): { document: BoardDocument; ids: string[] } {
  const sources = sortedByZ(document.elements.filter((element) => ids.has(element.id)));
  let z = topZ(document.elements);
  const copies = sources.map((element) => ({ ...element, id: newId(), x: element.x + offset.x, y: element.y + offset.y, z: ++z }));
  return { document: { ...document, elements: [...document.elements, ...copies] }, ids: copies.map((copy) => copy.id) };
}

export type Arrange = "front" | "back" | "forward" | "backward";

/**
 * Changes stacking order. The result renumbers z to 1..n so values stay small
 * and an order is never ambiguous.
 */
export function arrange(document: BoardDocument, ids: ReadonlySet<string>, how: Arrange): BoardDocument {
  if (ids.size === 0) return document;
  const order = sortedByZ(document.elements);
  let next: BoardElement[];
  if (how === "front") {
    next = [...order.filter((element) => !ids.has(element.id)), ...order.filter((element) => ids.has(element.id))];
  } else if (how === "back") {
    next = [...order.filter((element) => ids.has(element.id)), ...order.filter((element) => !ids.has(element.id))];
  } else {
    next = [...order];
    if (how === "forward") {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (ids.has(next[index]!.id) && !ids.has(next[index + 1]!.id)) {
          [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
        }
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        if (ids.has(next[index]!.id) && !ids.has(next[index - 1]!.id)) {
          [next[index], next[index - 1]] = [next[index - 1]!, next[index]!];
        }
      }
    }
  }
  const zById = new Map(next.map((element, index) => [element.id, index + 1]));
  let changed = false;
  const elements = document.elements.map((element) => {
    const z = zById.get(element.id)!;
    if (z === element.z) return element;
    changed = true;
    return { ...element, z };
  });
  return changed ? { ...document, elements } : document;
}

/** The topmost element under a world point, or null. */
export function hitTest(elements: readonly BoardElement[], point: Point): BoardElement | null {
  let best: BoardElement | null = null;
  for (const element of elements) {
    if (point.x >= element.x && point.x <= element.x + element.width && point.y >= element.y && point.y <= element.y + element.height) {
      if (!best || element.z > best.z || (element.z === best.z && element.id > best.id)) best = element;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

export const HISTORY_LIMIT = 100;

export type History = { past: BoardDocument[]; present: BoardDocument; future: BoardDocument[] };

export function createHistory(present: BoardDocument): History {
  return { past: [], present, future: [] };
}

/** Records `next` as a new step. A no-op change records nothing. */
export function commit(history: History, next: BoardDocument, base: BoardDocument = history.present): History {
  if (next === base) return history.present === next ? history : { ...history, present: next };
  const past = [...history.past, base];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [] };
}

/** Shows `next` without recording a step (used while a drag is in progress). */
export function preview(history: History, next: BoardDocument): History {
  return next === history.present ? history : { ...history, present: next };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  const next = history.future[0];
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: history.future.slice(1) };
}
