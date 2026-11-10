import { describe, expect, it } from "vitest";
import {
  arrange,
  boundsOf,
  commit,
  createHistory,
  duplicateElements,
  fitCamera,
  hitTest,
  initialImageSize,
  mapRect,
  moveElements,
  preview,
  redo,
  removeElements,
  resizeRect,
  screenToWorld,
  undo,
  worldToScreen,
  zoomAround,
  HISTORY_LIMIT,
} from "./canvas";
import { layoutSaveSchema, type BoardDocument, type BoardElement } from "./moodboard";

const image = (id: string, z: number, x = 0, y = 0): BoardElement => ({
  id,
  kind: "image",
  referenceId: "6f1c2f5e-8f43-4a8e-9b1f-2a4c3d5e6f70",
  x,
  y,
  width: 100,
  height: 50,
  z,
});
const doc = (...elements: BoardElement[]): BoardDocument => ({ background: "#000000", elements });
const zOrder = (document: BoardDocument) => [...document.elements].sort((a, b) => a.z - b.z).map((element) => element.id);

describe("camera", () => {
  it("converts between screen and world", () => {
    const camera = { x: 100, y: 50, zoom: 2 };
    expect(screenToWorld(camera, { x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
    expect(worldToScreen(camera, { x: 100, y: 100 })).toEqual({ x: 300, y: 250 });
  });

  it("zooms around the pointer, keeping the point under it still", () => {
    const camera = { x: 40, y: -20, zoom: 1 };
    const anchor = { x: 400, y: 300 };
    const before = screenToWorld(camera, anchor);
    const zoomed = zoomAround(camera, anchor, 2.5);
    const after = screenToWorld(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAround(camera, anchor, 1000).zoom).toBe(8);
    expect(zoomAround(camera, anchor, 0).zoom).toBe(0.05);
  });

  it("fits content into the viewport without magnifying past 100%", () => {
    const viewport = { width: 1000, height: 600 };
    const fitted = fitCamera({ x: 0, y: 0, width: 2000, height: 1000 }, viewport, 0);
    expect(fitted.zoom).toBe(0.5);
    expect(worldToScreen(fitted, { x: 1000, y: 500 })).toEqual({ x: 500, y: 300 });
    expect(fitCamera({ x: 0, y: 0, width: 10, height: 10 }, viewport).zoom).toBe(1);
    expect(fitCamera(null, viewport)).toEqual({ x: 500, y: 300, zoom: 1 });
  });
});

describe("resizeRect", () => {
  const rect = { x: 10, y: 20, width: 200, height: 100 };

  it("keeps the opposite corner fixed", () => {
    expect(resizeRect(rect, "se", { x: 20, y: 10 }, false)).toEqual({ x: 10, y: 20, width: 220, height: 110 });
    expect(resizeRect(rect, "nw", { x: 20, y: 10 }, false)).toEqual({ x: 30, y: 30, width: 180, height: 90 });
    expect(resizeRect(rect, "e", { x: 50, y: 999 }, false)).toEqual({ x: 10, y: 20, width: 250, height: 100 });
    expect(resizeRect(rect, "n", { x: 999, y: -30 }, false)).toEqual({ x: 10, y: -10, width: 200, height: 130 });
  });

  it("preserves proportions on corners when asked", () => {
    const result = resizeRect(rect, "se", { x: 100, y: 0 }, true);
    expect(result.width / result.height).toBeCloseTo(2);
    expect(result.width).toBe(300);
    const fromTopLeft = resizeRect(rect, "nw", { x: -100, y: 0 }, true);
    expect(fromTopLeft.width / fromTopLeft.height).toBeCloseTo(2);
    expect(fromTopLeft.x + fromTopLeft.width).toBe(rect.x + rect.width);
    expect(fromTopLeft.y + fromTopLeft.height).toBe(rect.y + rect.height);
  });

  it("never collapses below the minimum or flips", () => {
    const free = resizeRect(rect, "se", { x: -1000, y: -1000 }, false);
    expect(free).toMatchObject({ x: 10, y: 20, width: 16, height: 16 });
    const locked = resizeRect(rect, "se", { x: -1000, y: -1000 }, true);
    expect(locked.height).toBe(16);
    expect(locked.width / locked.height).toBeCloseTo(2);
  });

  it("maps members of a group proportionally", () => {
    const from = { x: 0, y: 0, width: 100, height: 100 };
    const to = { x: 0, y: 0, width: 200, height: 50 };
    expect(mapRect({ x: 50, y: 50, width: 50, height: 50 }, from, to)).toEqual({ x: 100, y: 25, width: 100, height: 25 });
  });

  it("sizes new images by their proportions", () => {
    expect(initialImageSize({ width: 1920, height: 1080 })).toEqual({ width: 360, height: 203 });
    expect(initialImageSize({ width: 1080, height: 1920 })).toEqual({ width: 203, height: 360 });
  });
});

describe("document operations", () => {
  it("moves, removes and hit-tests without mutating", () => {
    const original = doc(image("a", 1), image("b", 2, 50, 0));
    const moved = moveElements(original, new Set(["a"]), { x: 5, y: -5 });
    expect(moved.elements[0]).toMatchObject({ x: 5, y: -5 });
    expect(original.elements[0]).toMatchObject({ x: 0, y: 0 });
    expect(moveElements(original, new Set(["a"]), { x: 0, y: 0 })).toBe(original);
    expect(removeElements(original, new Set(["b"])).elements.map((element) => element.id)).toEqual(["a"]);
    expect(removeElements(original, new Set(["zzz"]))).toBe(original);
    // The overlap belongs to the element on top.
    expect(hitTest(original.elements, { x: 60, y: 10 })!.id).toBe("b");
    expect(hitTest(original.elements, { x: 500, y: 500 })).toBeNull();
  });

  it("duplicates above everything, offset, with new ids", () => {
    let counter = 0;
    const result = duplicateElements(doc(image("a", 1), image("b", 5)), new Set(["a"]), () => `copy-${++counter}`);
    expect(result.ids).toEqual(["copy-1"]);
    expect(result.document.elements.at(-1)).toMatchObject({ id: "copy-1", x: 24, y: 24, z: 6 });
  });

  it("changes stacking order in every direction", () => {
    const board = doc(image("a", 1), image("b", 2), image("c", 3), image("d", 4));
    expect(zOrder(arrange(board, new Set(["a"]), "front"))).toEqual(["b", "c", "d", "a"]);
    expect(zOrder(arrange(board, new Set(["d"]), "back"))).toEqual(["d", "a", "b", "c"]);
    expect(zOrder(arrange(board, new Set(["b"]), "forward"))).toEqual(["a", "c", "b", "d"]);
    expect(zOrder(arrange(board, new Set(["c"]), "backward"))).toEqual(["a", "c", "b", "d"]);
    // Two selected elements move together and keep their relative order.
    expect(zOrder(arrange(board, new Set(["a", "b"]), "forward"))).toEqual(["c", "a", "b", "d"]);
    expect(arrange(board, new Set(["d"]), "front")).toBe(board);
  });

  it("measures bounds", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([image("a", 1), image("b", 2, 200, 100)])).toEqual({ x: 0, y: 0, width: 300, height: 150 });
  });
});

describe("history", () => {
  it("undoes and redoes, and a new change clears redo", () => {
    const first = doc(image("a", 1));
    const second = moveElements(first, new Set(["a"]), { x: 10, y: 0 });
    const third = moveElements(second, new Set(["a"]), { x: 10, y: 0 });
    let history = commit(commit(createHistory(first), second), third);
    history = undo(history);
    expect(history.present).toBe(second);
    history = undo(history);
    expect(history.present).toBe(first);
    expect(undo(history)).toBe(history);
    history = redo(history);
    expect(history.present).toBe(second);
    history = commit(history, third);
    expect(history.future).toEqual([]);
  });

  it("records a whole drag as one step", () => {
    const start = doc(image("a", 1));
    let history = createHistory(start);
    let current = start;
    for (let step = 0; step < 20; step += 1) {
      current = moveElements(current, new Set(["a"]), { x: 1, y: 0 });
      history = preview(history, current);
    }
    history = commit(history, current, start);
    expect(history.past).toEqual([start]);
    expect(undo(history).present).toBe(start);
  });

  it("is bounded", () => {
    let history = createHistory(doc());
    for (let step = 0; step < HISTORY_LIMIT + 20; step += 1) history = commit(history, doc(image(`e${step}`, step)));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe("layout save schema", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  it("rejects duplicate ids, non-finite numbers and unknown kinds", () => {
    const element = { ...image(id(1), 1), referenceId: id(9) };
    expect(layoutSaveSchema.safeParse({ baseVersion: 1, background: "#000000", elements: [element] }).success).toBe(true);
    expect(layoutSaveSchema.safeParse({ baseVersion: 1, background: "#000000", elements: [element, element] }).success).toBe(false);
    expect(layoutSaveSchema.safeParse({ baseVersion: 1, background: "#000000", elements: [{ ...element, x: Infinity }] }).success).toBe(false);
    expect(layoutSaveSchema.safeParse({ baseVersion: 1, background: "#000000", elements: [{ ...element, kind: "video" }] }).success).toBe(false);
    expect(layoutSaveSchema.safeParse({ baseVersion: 1, background: "red", elements: [] }).success).toBe(false);
    expect(layoutSaveSchema.safeParse({ baseVersion: 0, background: "#000000", elements: [] }).success).toBe(false);
  });
});
