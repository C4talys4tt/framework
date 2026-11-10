"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sameDocument, type BoardDocument } from "../../domain/moodboard";

/**
 * Moodboard persistence: debounced, versioned, whole-layout saves.
 *
 * - Nothing is written while a drag or resize is in progress; a save goes out
 *   once activity has settled for SAVE_DELAY_MS. One continuous gesture is
 *   one write, however many frames it lasted.
 * - Each save sends the complete layout and the version it was based on. The
 *   server writes it in one transaction or not at all, so a save can be
 *   retried safely, and a tab holding a stale version gets a conflict instead
 *   of overwriting newer work.
 * - Before every save the layout is mirrored to localStorage. If saving keeps
 *   failing (offline, server down, signed out) the work survives a reload and
 *   is offered back. Failed saves retry with backoff.
 * - Closing or hiding the page with unsaved changes sends a final keepalive
 *   request and, on close, asks the browser to warn.
 */

export type SaveStatus = "saved" | "unsaved" | "saving" | "retrying" | "failed" | "conflict";

export const SAVE_DELAY_MS = 700;
const MAX_BACKOFF_MS = 30_000;
const KEEPALIVE_LIMIT = 60_000;

export type Draft = { baseVersion: number; document: BoardDocument; savedAt: string };

export function draftKey(boardId: string) {
  return `fw:moodboard-draft:${boardId}`;
}

export function readDraft(boardId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(boardId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    return draft && typeof draft.baseVersion === "number" && draft.document && Array.isArray(draft.document.elements) ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(boardId: string, draft: Draft) {
  try {
    window.localStorage.setItem(draftKey(boardId), JSON.stringify(draft));
  } catch {
    // Storage full or unavailable: the in-memory state and retries still protect the work.
  }
}

export function clearDraft(boardId: string) {
  try {
    window.localStorage.removeItem(draftKey(boardId));
  } catch {
    // Nothing to clear.
  }
}

function payload(document: BoardDocument, baseVersion: number) {
  return JSON.stringify({ baseVersion, background: document.background, elements: document.elements });
}

export function useAutosave({
  boardId,
  initialVersion,
  initialDocument,
  document,
  paused,
  onDropped,
}: {
  boardId: string;
  initialVersion: number;
  initialDocument: BoardDocument;
  document: BoardDocument;
  /** True while a gesture is in progress. */
  paused: boolean;
  /** Elements the server removed because their image was deleted from the library meanwhile. */
  onDropped: (elementIds: string[]) => void;
}) {
  const url = `/api/library/moodboards/${boardId}/layout`;
  // Only what happens asynchronously is state; "saved" vs "unsaved" is derived below.
  const [phase, setPhase] = useState<"idle" | "saving" | "retrying" | "failed" | "conflict">("idle");
  const [savedDocument, setSavedDocument] = useState(initialDocument);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const version = useRef(initialVersion);
  const saved = useRef(initialDocument);
  const latest = useRef(document);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const conflictVersion = useRef<number | null>(null);
  // Set when the person restored a draft: their version should win one conflict without asking.
  const forceNext = useRef(false);
  const onDroppedRef = useRef(onDropped);
  // Timers call the latest save through this, so save never refers to itself.
  const saveRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    latest.current = document;
    onDroppedRef.current = onDropped;
  });

  const dirty = !sameDocument(document, savedDocument);
  const status: SaveStatus = phase === "idle" ? (dirty ? "unsaved" : "saved") : phase;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const save = useCallback(async (): Promise<void> => {
    clearTimer();
    if (inFlight.current || conflictVersion.current !== null) return;
    const snapshot = latest.current;
    if (sameDocument(snapshot, saved.current)) {
      setPhase("idle");
      clearDraft(boardId);
      return;
    }
    inFlight.current = true;
    setPhase(attempts.current > 0 ? "retrying" : "saving");
    writeDraft(boardId, { baseVersion: version.current, document: snapshot, savedAt: new Date().toISOString() });

    let retryable = true;
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload(snapshot, version.current),
      });
      const body = (await response.json().catch(() => ({}))) as { version?: number; dropped?: string[]; message?: string };
      if (response.ok && typeof body.version === "number") {
        version.current = body.version;
        forceNext.current = false;
        saved.current = snapshot;
        setSavedDocument(snapshot);
        attempts.current = 0;
        setError(null);
        setLastSavedAt(new Date());
        if (body.dropped?.length) onDroppedRef.current(body.dropped);
        setPhase("idle");
        if (sameDocument(latest.current, snapshot)) clearDraft(boardId);
        return;
      }
      if (response.status === 409 && typeof body.version === "number" && forceNext.current) {
        // A restored draft usually conflicts with the save its own tab sent while closing.
        forceNext.current = false;
        version.current = body.version;
        timer.current = setTimeout(() => void saveRef.current(), 0);
        return;
      }
      if (response.status === 409 && typeof body.version === "number") {
        conflictVersion.current = body.version;
        setPhase("conflict");
        setError(body.message ?? "This board was changed somewhere else.");
        return;
      }
      // Errors that the same request will repeat need the person, not a retry loop.
      retryable = response.status >= 500 || response.status === 429;
      throw new Error(body.message ?? `Saving failed (${response.status}).`);
    } catch (caught) {
      const message = caught instanceof TypeError ? "You appear to be offline." : caught instanceof Error ? caught.message : "Saving failed.";
      setError(message);
      if (!retryable) {
        setPhase("failed");
        return;
      }
      attempts.current += 1;
      setPhase("retrying");
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts.current, 5));
      timer.current = setTimeout(() => void saveRef.current(), delay);
    } finally {
      inFlight.current = false;
      // Changes made while this save was in flight go out next.
      if (conflictVersion.current === null && !timer.current && !sameDocument(latest.current, saved.current) && attempts.current === 0) {
        timer.current = setTimeout(() => void saveRef.current(), SAVE_DELAY_MS);
      }
    }
  }, [boardId, url]);
  useEffect(() => {
    saveRef.current = save;
  });

  // Debounce: (re)arm after every change, but never during a gesture.
  useEffect(() => {
    if (conflictVersion.current !== null) return;
    if (sameDocument(document, saved.current)) return;
    if (paused || attempts.current > 0) return;
    clearTimer();
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  }, [document, paused, save]);

  // Coming back online retries straight away.
  useEffect(() => {
    const retry = () => {
      if (attempts.current > 0) {
        attempts.current = 0;
        void save();
      }
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [save]);

  // Leaving: warn on close, and push the last changes out with keepalive.
  useEffect(() => {
    const flush = () => {
      if (conflictVersion.current !== null) return;
      const snapshot = latest.current;
      if (sameDocument(snapshot, saved.current)) return;
      writeDraft(boardId, { baseVersion: version.current, document: snapshot, savedAt: new Date().toISOString() });
      const body = payload(snapshot, version.current);
      if (body.length > KEEPALIVE_LIMIT || inFlight.current) return;
      void fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
    };
    const onHide = () => {
      if (window.document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!sameDocument(latest.current, saved.current)) {
        flush();
        event.preventDefault();
      }
    };
    window.document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [boardId, url]);

  useEffect(() => () => clearTimer(), []);

  return {
    status,
    error,
    dirty,
    lastSavedAt,
    /** Save now (Ctrl/⌘+S, or "Retry"). */
    saveNow: useCallback(() => {
      attempts.current = 0;
      void save();
    }, [save]),
    /** After a conflict: keep this tab's layout and replace the stored one. */
    overwrite: useCallback(() => {
      if (conflictVersion.current === null) return;
      version.current = conflictVersion.current;
      conflictVersion.current = null;
      attempts.current = 0;
      setError(null);
      void save();
    }, [save]),
    /** The person chose to restore a draft: base on `nextVersion`, and let that save replace whatever is stored. */
    restoreDraft: useCallback((nextVersion: number) => {
      version.current = nextVersion;
      forceNext.current = true;
    }, []),
  };
}
