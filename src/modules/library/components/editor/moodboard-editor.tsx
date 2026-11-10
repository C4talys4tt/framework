"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { LocalDate } from "@/shared/ui/local-date";
import { deleteMoodboardAction, duplicateMoodboardAction } from "../../actions";
import {
  ALL_HANDLES,
  CORNER_HANDLES,
  arrange,
  boundsOf,
  commit,
  createHistory,
  duplicateElements,
  fitCamera,
  initialImageSize,
  intersects,
  mapRect,
  moveElements,
  preview,
  rectFromPoints,
  redo,
  removeElements,
  resizeRect,
  screenToWorld,
  topZ,
  undo,
  updateElements,
  worldToScreen,
  zoomAround,
  type Arrange,
  type Camera,
  type Handle,
  type History,
  type Point,
  type Rect,
} from "../../domain/canvas";
import { DEFAULT_TEXT_STYLE, sameDocument, type BoardDocument, type BoardElement, type BoardImage, type MoodboardDetail, type TextStyle } from "../../domain/moodboard";
import type { ReferenceListItem } from "../../domain/reference";
import { MoodboardFormDialog } from "../moodboard-form-dialog";
import { useUploads, type UploadTarget } from "../upload/upload-provider";
import { Banner, ContextBar, EditorToolbar, SaveIndicator, ShortcutsDialog, type Tool } from "./editor-chrome";
import { ElementView, textStyle as cssTextStyle } from "./element-view";
import { LibraryPanel, REFERENCE_DRAG_TYPE } from "./library-panel";
import { clearDraft, draftKey, readDraft, useAutosave, type Draft } from "./use-autosave";

type Gesture =
  | { kind: "pan"; pointerId: number; start: Point; camera: Camera }
  | { kind: "pinch"; startDistance: number; startCenter: Point; camera: Camera }
  | { kind: "move"; pointerId: number; start: Point; base: BoardDocument; ids: Set<string>; moved: boolean; clickedId: string; additive: boolean }
  | {
      kind: "resize";
      pointerId: number;
      start: Point;
      base: BoardDocument;
      handle: Handle;
      rects: Map<string, Rect>;
      bounds: Rect;
      single: BoardElement | null;
    }
  | { kind: "marquee"; pointerId: number; start: Point; initial: Set<string>; additive: boolean };

const DRAG_THRESHOLD = 3;
const HANDLE_CURSOR: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

function newId() {
  return crypto.randomUUID();
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [role='dialog'], [role='menu'], [role='listbox']"));
}

const subscribeNothing = () => () => undefined;

const openedDrafts = new Map<string, string | null>();
function draftAtOpen(boardId: string): string | null {
  if (!openedDrafts.has(boardId)) {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(draftKey(boardId));
    } catch {
      // Unavailable storage: nothing to recover.
    }
    openedDrafts.set(boardId, raw);
  }
  return openedDrafts.get(boardId) ?? null;
}

export function MoodboardEditor({
  board,
  projects,
  boardsHref,
  libraryHref,
  projectsHref,
}: {
  board: MoodboardDetail;
  projects: { id: string; name: string }[];
  boardsHref: string;
  libraryHref: string;
  projectsHref: string;
}) {
  const router = useRouter();
  const { enqueue, onUploaded } = useUploads();

  // ---------------------------------------------------------------------------
  // Document, history, selection
  // ---------------------------------------------------------------------------
  const [history, setHistory] = useState<History>(() => createHistory(board.document));
  const document = history.present;
  const [images, setImages] = useState<Record<string, BoardImage>>(board.images);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; base: BoardDocument; created: boolean } | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [panelOpen, setPanelOpen] = useState(false);
  const [gesturing, setGesturing] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const historyRef = useRef(history);
  const selectedRef = useRef(selected);
  useEffect(() => {
    historyRef.current = history;
    selectedRef.current = selected;
  });

  /** Records a change as one undoable step. */
  const apply = useCallback((change: (document: BoardDocument) => BoardDocument) => {
    setHistory((current) => commit(current, change(current.present)));
  }, []);

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  const autosave = useAutosave({
    boardId: board.id,
    initialVersion: board.version,
    initialDocument: board.document,
    document,
    paused: gesturing || editing !== null,
    onDropped: (ids) => {
      setHistory((current) => ({ ...current, present: removeElements(current.present, new Set(ids)) }));
      setNotice(`${ids.length === 1 ? "An image was" : `${ids.length} images were`} removed from this board because ${ids.length === 1 ? "it was" : "they were"} deleted from the library.`);
    },
  });

  const autosaveRef = useRef(autosave);
  useEffect(() => {
    autosaveRef.current = autosave;
  });

  // A draft left behind by a save that never completed (crash, offline, closed tab).
  // Only what was there when the board opened counts; drafts this session writes are not "left behind".
  const draftRaw = useSyncExternalStore(subscribeNothing, () => draftAtOpen(board.id), () => null);
  useEffect(() => () => void openedDrafts.delete(board.id), [board.id]);
  const [draftHandled, setDraftHandled] = useState(false);
  const draft: Draft | null = useMemo(() => {
    if (!draftRaw || draftHandled) return null;
    const parsed = readDraft(board.id);
    return parsed && !sameDocument(parsed.document, board.document) ? parsed : null;
  }, [draftRaw, draftHandled, board.id, board.document]);
  // A draft identical to what is stored was saved after all (often by the closing tab's last request).
  useEffect(() => {
    if (draftRaw && !draft && !draftHandled) clearDraft(board.id);
  }, [draftRaw, draft, draftHandled, board.id]);

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [cameraState, setCamera] = useState<Camera | null>(null);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Until the first pan or zoom, the camera frames the whole board.
  const initialFit = useMemo(() => (size ? fitCamera(boundsOf(board.document.elements), size) : null), [size, board.document.elements]);
  const camera: Camera = cameraState ?? initialFit ?? { x: 0, y: 0, zoom: 1 };
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  });

  const local = useCallback((clientX: number, clientY: number): Point => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const viewCenter = useCallback((): Point => {
    const element = viewport.current;
    return element ? { x: element.clientWidth / 2, y: element.clientHeight / 2 } : { x: 400, y: 300 };
  }, []);

  const zoomBy = useCallback((factor: number, anchor?: Point) => {
    setCamera(zoomAround(cameraRef.current, anchor ?? viewCenter(), cameraRef.current.zoom * factor));
  }, [viewCenter]);

  const fit = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const ids = selectedRef.current;
    const elements = historyRef.current.present.elements;
    const target = ids.size > 0 ? elements.filter((item) => ids.has(item.id)) : elements;
    setCamera(fitCamera(boundsOf(target), { width: element.clientWidth, height: element.clientHeight }));
  }, []);

  // Wheel: scroll pans; Ctrl/⌘ + scroll (and trackpad pinch) zooms at the pointer.
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    function onWheel(event: WheelEvent) {
      if ((event.target as HTMLElement | null)?.closest("[data-editor-chrome]")) return;
      event.preventDefault();
      const rect = element!.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const unit = event.deltaMode === 1 ? 16 : 1;
      if (event.ctrlKey || event.metaKey) {
        const delta = Math.max(-80, Math.min(80, event.deltaY * unit));
        setCamera(zoomAround(cameraRef.current, anchor, cameraRef.current.zoom * Math.exp(-delta * 0.0125)));
      } else {
        const current = cameraRef.current;
        setCamera({ ...current, x: current.x - event.deltaX * unit, y: current.y - event.deltaY * unit });
      }
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  // ---------------------------------------------------------------------------
  // Adding things
  // ---------------------------------------------------------------------------
  const addImage = useCallback(
    (image: BoardImage, at?: Point) => {
      setImages((current) => (current[image.id] ? current : { ...current, [image.id]: image }));
      const cam = cameraRef.current;
      const center = screenToWorld(cam, at ?? viewCenter());
      const size = initialImageSize(image, Math.max(120, Math.min(720, 360 / cam.zoom)));
      const id = newId();
      apply((current) => ({
        ...current,
        elements: [
          ...current.elements,
          { id, kind: "image", referenceId: image.id, x: center.x - size.width / 2, y: center.y - size.height / 2, width: size.width, height: size.height, z: topZ(current.elements) + 1 },
        ],
      }));
      setSelected(new Set([id]));
      setTool("select");
    },
    [apply, viewCenter],
  );

  const addText = useCallback(
    (at?: Point) => {
      const cam = cameraRef.current;
      const point = screenToWorld(cam, at ?? viewCenter());
      const fontSize = Math.round(Math.max(14, Math.min(96, DEFAULT_TEXT_STYLE.fontSize / Math.min(1, cam.zoom))));
      const width = Math.max(160, 320 / cam.zoom);
      const id = newId();
      const base = historyRef.current.present;
      const element: BoardElement = {
        id,
        kind: "text",
        text: "",
        style: { ...DEFAULT_TEXT_STYLE, fontSize },
        x: point.x - width / 2,
        y: point.y - fontSize * 0.65,
        width,
        height: Math.round(fontSize * 1.3),
        z: topZ(base.elements) + 1,
      };
      // Shown but not recorded until there is some text (see finishEditing).
      setHistory((current) => preview(current, { ...current.present, elements: [...current.present.elements, element] }));
      setSelected(new Set([id]));
      setEditing({ id, base, created: true });
      setTool("select");
    },
    [viewCenter],
  );

  // Files dropped on the canvas: upload, then place each where it was dropped.
  const pendingDrops = useRef<Point[]>([]);
  useEffect(
    () =>
      onUploaded((reference: ReferenceListItem, target: UploadTarget) => {
        if (target.workspaceId !== board.workspaceId || pendingDrops.current.length === 0) return;
        const point = pendingDrops.current.shift()!;
        addImage({ id: reference.id, title: reference.title, width: reference.width, height: reference.height, dominantColor: reference.dominantColor }, point);
      }),
    [onUploaded, addImage, board.workspaceId],
  );

  // ---------------------------------------------------------------------------
  // Editing text
  // ---------------------------------------------------------------------------
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  });

  const finishEditing = useCallback(() => {
    const current = editingRef.current;
    if (!current) return;
    editingRef.current = null;
    setEditing(null);
    setHistory((h) => {
      const element = h.present.elements.find((item) => item.id === current.id);
      if (element && element.kind === "text" && element.text.trim() === "") {
        // Empty text: a new box vanishes without a trace; an existing one is removed as a step.
        return current.created ? preview(h, current.base) : commit(h, removeElements(h.present, new Set([current.id])), current.base);
      }
      return commit(h, h.present, current.base);
    });
  }, []);

  const startEditing = useCallback((id: string) => {
    setEditing({ id, base: historyRef.current.present, created: false });
    setSelected(new Set([id]));
  }, []);

  // ---------------------------------------------------------------------------
  // Pointer interaction
  // ---------------------------------------------------------------------------
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const frame = useRef<number | null>(null);
  const lastMove = useRef<{ x: number; y: number; shift: boolean } | null>(null);

  const elementAt = (target: EventTarget | null) => (target as HTMLElement | null)?.closest<HTMLElement>("[data-element-id]")?.dataset.elementId ?? null;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-editor-chrome], textarea")) return;
    if (editing) finishEditing();
    const point = local(event.clientX, event.clientY);

    if (event.pointerType === "touch") {
      touches.current.set(event.pointerId, point);
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()] as [Point, Point];
        gesture.current = { kind: "pinch", startDistance: Math.hypot(a.x - b.x, a.y - b.y), startCenter: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: cameraRef.current };
        return;
      }
    }

    const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | undefined;
    const hitId = elementAt(event.target);
    const panning = event.button === 1 || tool === "hand" || spaceHeld || (event.pointerType === "touch" && !hitId && !handle);
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    // preventDefault stops the browser focusing the canvas; keyboard users still need it focused.
    viewport.current?.focus({ preventScroll: true });

    if (panning) {
      gesture.current = { kind: "pan", pointerId: event.pointerId, start: point, camera: cameraRef.current };
      setGesturing(true);
      return;
    }

    const doc = historyRef.current.present;
    const world = screenToWorld(cameraRef.current, point);

    if (handle) {
      const ids = selectedRef.current;
      const members = doc.elements.filter((element) => ids.has(element.id));
      const rects = new Map(members.map((element) => [element.id, { x: element.x, y: element.y, width: element.width, height: element.height }]));
      gesture.current = {
        kind: "resize",
        pointerId: event.pointerId,
        start: world,
        base: doc,
        handle,
        rects,
        bounds: boundsOf([...rects.values()])!,
        single: members.length === 1 ? members[0]! : null,
      };
      setGesturing(true);
      setResizing(true);
      return;
    }

    if (hitId) {
      let ids = selectedRef.current;
      if (event.shiftKey) {
        ids = new Set(ids);
        if (ids.has(hitId)) ids.delete(hitId);
        else ids.add(hitId);
      } else if (!ids.has(hitId)) {
        ids = new Set([hitId]);
      }
      setSelected(ids);
      gesture.current = { kind: "move", pointerId: event.pointerId, start: world, base: doc, ids: new Set(ids), moved: false, clickedId: hitId, additive: event.shiftKey };
      setGesturing(true);
      return;
    }

    const initial = event.shiftKey ? new Set(selectedRef.current) : new Set<string>();
    if (!event.shiftKey) setSelected(new Set());
    gesture.current = { kind: "marquee", pointerId: event.pointerId, start: point, initial, additive: event.shiftKey };
    setGesturing(true);
  }

  const applyMove = useCallback(() => {
    frame.current = null;
    const current = gesture.current;
    const last = lastMove.current;
    if (!current || !last) return;
    const point = { x: last.x, y: last.y };
    const cam = cameraRef.current;

    switch (current.kind) {
      case "pan":
        setCamera({ ...current.camera, x: current.camera.x + point.x - current.start.x, y: current.camera.y + point.y - current.start.y });
        return;
      case "pinch": {
        const [a, b] = [...touches.current.values()] as [Point, Point];
        if (!a || !b) return;
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const ratio = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, current.startDistance);
        const moved = { ...current.camera, x: current.camera.x + center.x - current.startCenter.x, y: current.camera.y + center.y - current.startCenter.y };
        setCamera(zoomAround(moved, center, current.camera.zoom * ratio));
        return;
      }
      case "move": {
        const world = screenToWorld(cam, point);
        let dx = world.x - current.start.x;
        let dy = world.y - current.start.y;
        if (!current.moved && Math.hypot(dx * cam.zoom, dy * cam.zoom) < DRAG_THRESHOLD) return;
        current.moved = true;
        // Shift constrains to the dominant axis.
        if (last.shift && !current.additive) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        setHistory((h) => preview(h, moveElements(current.base, current.ids, { x: dx, y: dy })));
        return;
      }
      case "resize": {
        const world = screenToWorld(cam, point);
        const delta = { x: world.x - current.start.x, y: world.y - current.start.y };
        const corner = CORNER_HANDLES.includes(current.handle);
        let next: BoardDocument;
        if (current.single) {
          // Images keep their proportions on corners unless Shift is held; text resizes freely.
          const keep = current.single.kind === "image" ? corner && !last.shift : last.shift;
          const rect = resizeRect(current.rects.get(current.single.id)!, current.handle, delta, keep);
          next = updateElements(current.base, new Set([current.single.id]), (element) => ({ ...element, ...rect }));
        } else {
          const bounds = resizeRect(current.bounds, current.handle, delta, !last.shift);
          next = updateElements(current.base, new Set(current.rects.keys()), (element) => ({ ...element, ...mapRect(current.rects.get(element.id)!, current.bounds, bounds) }));
        }
        setHistory((h) => preview(h, next));
        return;
      }
      case "marquee": {
        const rect = rectFromPoints(current.start, point);
        setMarquee(rect);
        const topLeft = screenToWorld(cam, { x: rect.x, y: rect.y });
        const world = { x: topLeft.x, y: topLeft.y, width: rect.width / cam.zoom, height: rect.height / cam.zoom };
        const hits = historyRef.current.present.elements.filter((element) => intersects(world, element)).map((element) => element.id);
        setSelected(new Set([...current.initial, ...hits]));
        return;
      }
    }
  }, []);

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" && touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, local(event.clientX, event.clientY));
    }
    if (!gesture.current) return;
    const point = local(event.clientX, event.clientY);
    lastMove.current = { ...point, shift: event.shiftKey };
    // At most one update per frame, however fast the pointer reports.
    if (frame.current === null) frame.current = requestAnimationFrame(applyMove);
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    touches.current.delete(event.pointerId);
    const current = gesture.current;
    if (!current) return;
    if (current.kind !== "pinch" && current.pointerId !== event.pointerId) return;
    if (current.kind === "pinch" && touches.current.size > 0) return;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      applyMove();
    }
    gesture.current = null;
    lastMove.current = null;
    setGesturing(false);
    setResizing(false);
    setMarquee(null);

    if (current.kind === "move") {
      if (current.moved) setHistory((h) => commit(h, h.present, current.base));
      // A plain click on one of several selected elements selects just that one.
      else if (!current.additive && current.ids.size > 1) setSelected(new Set([current.clickedId]));
    } else if (current.kind === "resize") {
      setHistory((h) => commit(h, h.present, current.base));
    }
  }

  function onDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-editor-chrome], textarea")) return;
    const id = elementAt(event.target);
    const element = id ? historyRef.current.present.elements.find((item) => item.id === id) : null;
    if (element?.kind === "text") startEditing(element.id);
    else if (!id) addText(local(event.clientX, event.clientY));
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------
  const removeSelected = useCallback(() => {
    const ids = selectedRef.current;
    if (ids.size === 0) return;
    apply((current) => removeElements(current, ids));
    setSelected(new Set());
  }, [apply]);

  const duplicateSelected = useCallback(() => {
    const ids = selectedRef.current;
    if (ids.size === 0) return;
    const offset = 24 / cameraRef.current.zoom;
    const result = duplicateElements(historyRef.current.present, ids, newId, { x: offset, y: offset });
    setHistory((h) => commit(h, result.document));
    setSelected(new Set(result.ids));
  }, []);

  const arrangeSelected = useCallback((how: Arrange) => apply((current) => arrange(current, selectedRef.current, how)), [apply]);

  const nudge = useCallback((dx: number, dy: number) => apply((current) => moveElements(current, selectedRef.current, { x: dx, y: dy })), [apply]);

  const setTextStyle = useCallback(
    (patch: Partial<TextStyle>) =>
      apply((current) => updateElements(current, selectedRef.current, (element) => (element.kind === "text" ? { ...element, style: { ...element.style, ...patch } } : element))),
    [apply],
  );

  // Background: the native colour picker reports continuously; only the final pick is a step.
  const backgroundBase = useRef<BoardDocument | null>(null);
  const setBackground = useCallback((color: string, final: boolean) => {
    setHistory((h) => {
      backgroundBase.current ??= h.present;
      const next = { ...h.present, background: color };
      if (!final) return preview(h, next);
      const base = backgroundBase.current;
      backgroundBase.current = null;
      return base.background === color ? preview(h, base) : commit(h, next, base);
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTyping(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const handled = () => event.preventDefault();

      if (mod && key === "z") {
        handled();
        setHistory((h) => (event.shiftKey ? redo(h) : undo(h)));
        setSelected(new Set());
      } else if (mod && key === "y") {
        handled();
        setHistory((h) => redo(h));
      } else if (mod && key === "s") {
        handled();
        autosaveRef.current.saveNow();
      } else if (mod && key === "d") {
        handled();
        duplicateSelected();
      } else if (mod && key === "a") {
        handled();
        setSelected(new Set(historyRef.current.present.elements.map((element) => element.id)));
      } else if (mod && (event.key === "]" || event.key === "[")) {
        handled();
        arrangeSelected(event.key === "]" ? "front" : "back");
      } else if (mod) {
        return;
      } else if (event.key === "Delete" || event.key === "Backspace") {
        handled();
        removeSelected();
      } else if (event.key === "Escape") {
        setSelected(new Set());
      } else if (event.key.startsWith("Arrow") && selectedRef.current.size > 0) {
        handled();
        const step = (event.shiftKey ? 10 : 1) / Math.max(0.25, Math.min(1, cameraRef.current.zoom));
        nudge(event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
      } else if (event.key === "]" || event.key === "[") {
        handled();
        arrangeSelected(event.key === "]" ? "forward" : "backward");
      } else if (event.key === "Enter") {
        const ids = selectedRef.current;
        const element = ids.size === 1 ? historyRef.current.present.elements.find((item) => ids.has(item.id)) : null;
        if (element?.kind === "text") {
          handled();
          startEditing(element.id);
        }
      } else if (key === "v") {
        setTool("select");
      } else if (key === "h") {
        setTool("hand");
      } else if (key === "t") {
        handled();
        addText();
      } else if (key === "i") {
        setPanelOpen((open) => !open);
      } else if (event.key === "+" || event.key === "=") {
        zoomBy(1.25);
      } else if (event.key === "-" || event.key === "_") {
        zoomBy(0.8);
      } else if (event.key === "0") {
        setCamera(zoomAround(cameraRef.current, viewCenter(), 1));
      } else if (event.key === "1") {
        fit();
      } else if (event.key === "?") {
        setShortcutsOpen(true);
      } else if (event.key === " " && !event.repeat) {
        handled();
        setSpaceHeld(true);
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === " ") setSpaceHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [addText, arrangeSelected, duplicateSelected, fit, nudge, removeSelected, startEditing, viewCenter, zoomBy]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const selectedElements = useMemo(() => document.elements.filter((element) => selected.has(element.id)), [document.elements, selected]);
  const selectionBounds = useMemo(() => boundsOf(selectedElements), [selectedElements]);
  const single = selectedElements.length === 1 ? selectedElements[0]! : null;
  const textSelection = selectedElements.length > 0 && selectedElements.every((element) => element.kind === "text") ? (selectedElements[0] as Extract<BoardElement, { kind: "text" }>) : null;
  const editingElement = editing ? (document.elements.find((element) => element.id === editing.id) as Extract<BoardElement, { kind: "text" }> | undefined) : undefined;
  const light = isLight(document.background);
  const projectHref = board.project ? `${projectsHref}/${board.project.id}/moodboards` : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-editor-chrome>
        <EditorToolbar
          name={board.name}
          project={board.project}
          boardsHref={boardsHref}
          projectHref={projectHref}
          tool={tool}
          onTool={setTool}
          onAddText={() => addText()}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((open) => !open)}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={() => {
            setHistory((h) => undo(h));
            setSelected(new Set());
          }}
          onRedo={() => setHistory((h) => redo(h))}
          zoom={camera.zoom}
          onZoomIn={() => zoomBy(1.25)}
          onZoomOut={() => zoomBy(0.8)}
          onZoomReset={() => setCamera(zoomAround(camera, viewCenter(), 1))}
          onFit={fit}
          background={document.background}
          onBackground={setBackground}
          status={autosave.status}
          error={autosave.error}
          onRetry={autosave.saveNow}
          onEditDetails={() => setDetailsOpen(true)}
          onDuplicate={async () => {
            autosave.saveNow();
            const result = await duplicateMoodboardAction({ moodboardId: board.id });
            if (result.ok) router.push(`${boardsHref}/${result.data.id}`);
            else setNotice(result.message);
          }}
          onDelete={board.canDelete ? () => setDeleteOpen(true) : null}
          onShortcuts={() => setShortcutsOpen(true)}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={viewport}
          role="application"
          aria-label={`Moodboard canvas: ${board.name}. ${document.elements.length} items. Press ? for keyboard shortcuts.`}
          tabIndex={0}
          data-testid="moodboard-canvas"
          className={cn(
            "relative min-w-0 flex-1 touch-none overflow-hidden outline-none",
            tool === "hand" || spaceHeld ? (gesturing ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
          )}
          style={{
            backgroundColor: document.background,
            backgroundImage: `radial-gradient(${light ? "rgb(0 0 0 / 0.13)" : "rgb(255 255 255 / 0.07)"} ${Math.max(0.6, camera.zoom)}px, transparent 0)`,
            backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
            backgroundPosition: `${camera.x}px ${camera.y}px`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onDoubleClick={onDoubleClick}
          onDragOver={(event) => {
            const types = Array.from(event.dataTransfer.types);
            if (types.includes(REFERENCE_DRAG_TYPE) || types.includes("Files")) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              if (!dropActive) setDropActive(true);
            }
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDropActive(false);
          }}
          onDrop={(event) => {
            setDropActive(false);
            const point = local(event.clientX, event.clientY);
            const data = event.dataTransfer.getData(REFERENCE_DRAG_TYPE);
            if (data) {
              event.preventDefault();
              try {
                addImage(JSON.parse(data) as BoardImage, point);
              } catch {
                // Not ours.
              }
              return;
            }
            if (event.dataTransfer.files.length > 0) {
              event.preventDefault();
              const files = Array.from(event.dataTransfer.files);
              files.forEach((_, index) => pendingDrops.current.push({ x: point.x + index * 28, y: point.y + index * 28 }));
              enqueue(files, { workspaceId: board.workspaceId });
            }
          }}
        >
          {/* The world: everything in board coordinates, transformed by the camera. */}
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`, visibility: size ? "visible" : "hidden" }}
          >
            {document.elements.map((element) => (
              <ElementView
                key={element.id}
                element={element}
                image={element.kind === "image" ? images[element.referenceId] : undefined}
                zoom={camera.zoom}
                hidden={editing?.id === element.id}
                interactive={tool === "select" && !spaceHeld}
              />
            ))}
            {editingElement ? (
              <TextEditor
                key={editingElement.id}
                element={editingElement}
                onChange={(text, height) =>
                  setHistory((h) => preview(h, updateElements(h.present, new Set([editingElement.id]), (element) => ({ ...element, text, height: Math.max(element.height, height) }) as BoardElement)))
                }
                onDone={finishEditing}
              />
            ) : null}
          </div>

          {/* Selection, drawn in screen space so handles stay the same size at any zoom. */}
          <SelectionOverlay camera={camera} elements={selectedElements} bounds={selectionBounds} showHandles={!gesturing || resizing} editingId={editing?.id ?? null} />
          {marquee ? (
            <div aria-hidden className="pointer-events-none absolute border border-accent bg-accent/10" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />
          ) : null}

          {document.elements.length === 0 && !editing ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
              <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                <p className={cn("text-sm font-medium", light ? "text-black/70" : "text-fg")}>An empty canvas</p>
                <p className={cn("text-[0.8125rem] leading-relaxed", light ? "text-black/50" : "text-fg-muted")}>
                  Add images from the library, drop image files here, or double-click anywhere to write a note.
                </p>
                <div data-editor-chrome className="pointer-events-auto">
                  <Button variant="primary" onClick={() => setPanelOpen(true)}>
                    Add images
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {dropActive ? <div aria-hidden className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-accent-line bg-accent/5" /> : null}

          <div data-editor-chrome className="pointer-events-none absolute inset-x-3 top-3 flex flex-col items-center gap-2">
            {draft ? (
              <Banner
                tone="warning"
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        clearDraft(board.id);
                        setDraftHandled(true);
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        autosave.restoreDraft(board.version);
                        setHistory((h) => commit(h, draft.document));
                        setDraftHandled(true);
                      }}
                    >
                      Restore
                    </Button>
                  </>
                }
              >
                Changes made <LocalDate value={draft.savedAt} options={{ day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }} /> were never saved. Restore them?
              </Banner>
            ) : null}
            {autosave.status === "conflict" ? (
              <Banner
                tone="danger"
                actions={
                  <>
                    <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
                      Load theirs
                    </Button>
                    <Button size="sm" variant="primary" onClick={autosave.overwrite}>
                      Keep mine
                    </Button>
                  </>
                }
              >
                This board was changed in another tab or by someone else. Your version is kept here and on this device until you choose.
              </Banner>
            ) : null}
            {autosave.status === "failed" ? (
              <Banner tone="danger" actions={<Button size="sm" onClick={autosave.saveNow}>Retry</Button>}>
                Your changes are not saved: {autosave.error} They are kept on this device.
              </Banner>
            ) : null}
            {notice ? (
              <Banner tone="info" actions={<Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>}>
                {notice}
              </Banner>
            ) : null}
          </div>

          <div data-editor-chrome className="pointer-events-none absolute inset-x-3 bottom-4 flex justify-center">
            {selectedElements.length > 0 && !gesturing && !editing ? (
              <ContextBar
                count={selectedElements.length}
                textStyle={textSelection?.style ?? null}
                onTextStyle={setTextStyle}
                onArrange={arrangeSelected}
                onDuplicate={duplicateSelected}
                onDelete={removeSelected}
                onEditText={single?.kind === "text" ? () => startEditing(single.id) : null}
                openHref={single?.kind === "image" ? `${libraryHref}/r/${single.referenceId}` : null}
              />
            ) : null}
          </div>

          <div data-editor-chrome className="absolute bottom-4 left-4 md:hidden">
            <SaveIndicator status={autosave.status} error={autosave.error} onRetry={autosave.saveNow} />
          </div>
        </div>

        {panelOpen ? (
          <div data-editor-chrome className="hidden h-full md:block">
            <LibraryPanel workspaceId={board.workspaceId} onAdd={(image) => addImage(image)} onClose={() => setPanelOpen(false)} />
          </div>
        ) : null}
      </div>

      <MoodboardFormDialog open={detailsOpen} onOpenChange={setDetailsOpen} mode={{ kind: "edit", moodboard: board }} projects={projects} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${board.name}”?`}
        description="The board and its layout are deleted. The references on it stay in the library."
        confirmLabel="Delete moodboard"
        onConfirm={async () => {
          const result = await deleteMoodboardAction({ moodboardId: board.id });
          if (!result.ok) return result.message;
          clearDraft(board.id);
          router.push(boardsHref);
          return undefined;
        }}
      />
    </div>
  );
}

function isLight(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255) > 150;
}

function SelectionOverlay({
  camera,
  elements,
  bounds,
  showHandles,
  editingId,
}: {
  camera: Camera;
  elements: BoardElement[];
  bounds: Rect | null;
  showHandles: boolean;
  editingId: string | null;
}) {
  if (!bounds || elements.length === 0) return null;
  const screen = (rect: Rect) => {
    const topLeft = worldToScreen(camera, rect);
    return { left: topLeft.x, top: topLeft.y, width: rect.width * camera.zoom, height: rect.height * camera.zoom };
  };
  const group = screen(bounds);
  const handles = elements.length === 1 ? ALL_HANDLES : CORNER_HANDLES;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: 5 }}>
      {elements.map((element) => (
        <div key={element.id} className="absolute border border-accent" style={screen(element)} />
      ))}
      {elements.length > 1 ? <div className="absolute border border-dashed border-accent/70" style={{ ...group, left: group.left - 4, top: group.top - 4, width: group.width + 8, height: group.height + 8 }} /> : null}
      {showHandles && editingId === null
        ? handles.map((handle) => {
            const x = handle.includes("w") ? 0 : handle.includes("e") ? 1 : 0.5;
            const y = handle.includes("n") ? 0 : handle.includes("s") ? 1 : 0.5;
            return (
              <div
                key={handle}
                data-handle={handle}
                className="pointer-events-auto absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-accent bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
                style={{ left: group.left + group.width * x, top: group.top + group.height * y, cursor: HANDLE_CURSOR[handle] }}
              />
            );
          })
        : null}
    </div>
  );
}

/** Edits a text element in place, in world space so it matches exactly what is drawn. */
function TextEditor({
  element,
  onChange,
  onDone,
}: {
  element: Extract<BoardElement, { kind: "text" }>;
  onChange: (text: string, height: number) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      aria-label="Text"
      value={element.text}
      placeholder="Type something"
      rows={1}
      onChange={(event) => {
        const area = event.currentTarget;
        area.style.height = "auto";
        const height = area.scrollHeight;
        area.style.height = "";
        onChange(area.value, height);
      }}
      onBlur={onDone}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
          event.preventDefault();
          onDone();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 leading-[1.3] outline outline-1 outline-accent placeholder:opacity-40"
      style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: 100000, ...cssTextStyle(element.style) }}
    />
  );
}
