"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronDown, Copy, ImageUp, RotateCw, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Spinner } from "@/shared/ui/spinner";
import { MAX_FILES_PER_BATCH, formatBytes, precheckFile } from "../../domain/files";
import type { ReferenceListItem } from "../../domain/reference";

/** Where an upload lands: always a workspace's library, optionally also a collection or project. */
export type UploadTarget = { workspaceId: string; collectionId?: string; projectId?: string };

type Status = "queued" | "uploading" | "processing" | "done" | "failed" | "cancelled";

type UploadItem = {
  id: string;
  file: File;
  target: UploadTarget;
  status: Status;
  /** 0..1 of bytes sent. */
  progress: number;
  error?: string;
  /** Errors the server will repeat (wrong type, too large): retrying is pointless. */
  permanent?: boolean;
  duplicateOf?: { id: string; title: string } | null;
  warning?: string | null;
  reference?: ReferenceListItem;
};

type UploadContextValue = {
  enqueue: (files: FileList | File[], target: UploadTarget) => void;
  /** Subscribe to finished uploads (e.g. to show them before the page refreshes). */
  onUploaded: (listener: (reference: ReferenceListItem, target: UploadTarget) => void) => () => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUploads(): UploadContextValue {
  const value = use(UploadContext);
  if (!value) throw new Error("useUploads must be used inside <UploadProvider>");
  return value;
}

const CONCURRENCY = 3;

function uploadUrl(target: UploadTarget): string {
  const params = new URLSearchParams({ workspace: target.workspaceId });
  if (target.collectionId) params.set("collection", target.collectionId);
  if (target.projectId) params.set("project", target.projectId);
  return `/api/library/uploads?${params}`;
}

/**
 * Queues uploads for the whole library, so they keep going while you move
 * between its pages. XMLHttpRequest (not fetch) because only it reports upload
 * progress in every browser.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const listeners = useRef(new Set<(reference: ReferenceListItem, target: UploadTarget) => void>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  // One refresh after a burst of completions, not one per file.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 600);
  }, [router]);

  const start = useCallback(
    (item: UploadItem) => {
      const request = new XMLHttpRequest();
      requests.current.set(item.id, request);
      request.open("POST", uploadUrl(item.target));
      request.setRequestHeader("X-File-Name", encodeURIComponent(item.file.name));
      request.setRequestHeader("Content-Type", item.file.type || "application/octet-stream");
      request.responseType = "json";
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) update(item.id, { progress: event.loaded / event.total });
      };
      // Bytes are all sent; the server is decoding and making previews.
      request.upload.onload = () => update(item.id, { status: "processing", progress: 1 });
      request.onload = () => {
        requests.current.delete(item.id);
        const body = (request.response ?? {}) as {
          message?: string;
          reference?: ReferenceListItem;
          duplicateOf?: { id: string; title: string } | null;
          warning?: string | null;
        };
        if (request.status === 201 && body.reference) {
          update(item.id, { status: "done", progress: 1, reference: body.reference, duplicateOf: body.duplicateOf, warning: body.warning });
          for (const listener of listeners.current) listener(body.reference, item.target);
          scheduleRefresh();
        } else {
          update(item.id, {
            status: "failed",
            error: body.message ?? `The upload failed (${request.status}).`,
            permanent: [404, 413, 415, 422].includes(request.status),
          });
        }
      };
      request.onerror = () => {
        requests.current.delete(item.id);
        update(item.id, { status: "failed", error: "The connection was lost. Check your network and retry." });
      };
      request.onabort = () => {
        requests.current.delete(item.id);
        update(item.id, { status: "cancelled", error: "Cancelled." });
      };
      update(item.id, { status: "uploading", progress: 0, error: undefined });
      request.send(item.file);
    },
    [scheduleRefresh, update],
  );

  // A simple scheduler: whenever the list changes, start queued items up to the limit.
  useEffect(() => {
    const active = items.filter((item) => item.status === "uploading" || item.status === "processing").length;
    const waiting = items.filter((item) => item.status === "queued");
    for (const item of waiting.slice(0, Math.max(0, CONCURRENCY - active))) start(item);
  }, [items, start]);

  // Leaving the page mid-upload loses the upload: say so.
  const busy = items.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "processing");
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  useEffect(() => {
    const open = requests.current;
    return () => {
      for (const request of open.values()) request.abort();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const enqueue = useCallback((files: FileList | File[], target: UploadTarget) => {
    const list = Array.from(files).slice(0, MAX_FILES_PER_BATCH);
    const additions: UploadItem[] = list.map((file) => {
      const problem = precheckFile(file);
      return {
        id: crypto.randomUUID(),
        file,
        target,
        status: problem ? "failed" : "queued",
        progress: 0,
        error: problem ?? undefined,
        permanent: Boolean(problem),
      };
    });
    if (additions.length === 0) return;
    setCollapsed(false);
    setItems((current) => [...current, ...additions]);
  }, []);

  const onUploaded = useCallback((listener: (reference: ReferenceListItem, target: UploadTarget) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(() => ({ enqueue, onUploaded }), [enqueue, onUploaded]);

  return (
    <UploadContext value={value}>
      {children}
      <UploadTray
        items={items}
        collapsed={collapsed}
        onToggle={() => setCollapsed((current) => !current)}
        onRetry={(id) => update(id, { status: "queued", progress: 0, error: undefined })}
        onCancel={(id) => requests.current.get(id)?.abort()}
        onDismiss={() => setItems((current) => current.filter((item) => item.status === "queued" || item.status === "uploading" || item.status === "processing"))}
        onRetryAll={() =>
          setItems((current) =>
            current.map((item) => (item.status === "failed" && !item.permanent ? { ...item, status: "queued", progress: 0, error: undefined } : item)),
          )
        }
      />
    </UploadContext>
  );
}

function UploadTray({
  items,
  collapsed,
  onToggle,
  onRetry,
  onCancel,
  onDismiss,
  onRetryAll,
}: {
  items: UploadItem[];
  collapsed: boolean;
  onToggle: () => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: () => void;
  onRetryAll: () => void;
}) {
  if (items.length === 0) return null;
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const retryable = items.filter((item) => item.status === "failed" && !item.permanent).length;
  const active = items.length - done - failed - items.filter((item) => item.status === "cancelled").length;
  const sent = items.reduce((sum, item) => sum + (item.status === "done" ? 1 : item.progress), 0);
  const summary =
    active > 0
      ? `Uploading · ${done} of ${items.length} done`
      : failed > 0
        ? `${done} uploaded, ${failed} failed`
        : `${done} ${done === 1 ? "image" : "images"} uploaded`;

  return (
    <section
      aria-label="Uploads"
      className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-overlay shadow-overlay animate-pop-in"
    >
      <header className="flex h-11 items-center gap-2.5 border-b border-line-subtle pl-3.5 pr-1.5">
        {active > 0 ? <Spinner className="text-accent" /> : failed > 0 ? <AlertCircle aria-hidden className="size-4 text-danger" /> : <Check aria-hidden className="size-4 text-success" />}
        <p role="status" className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-fg">
          {summary}
        </p>
        {retryable > 1 && active === 0 ? (
          <button type="button" onClick={onRetryAll} className="h-7 rounded-sm px-2 text-xs font-medium text-accent hover:bg-hover">
            Retry all
          </button>
        ) : null}
        <button
          type="button"
          aria-label={collapsed ? "Show uploads" : "Hide uploads"}
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="grid size-7 place-items-center rounded-sm text-fg-faint hover:bg-hover hover:text-fg"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
        </button>
        {active === 0 ? (
          <button type="button" aria-label="Dismiss uploads" onClick={onDismiss} className="grid size-7 place-items-center rounded-sm text-fg-faint hover:bg-hover hover:text-fg">
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </header>
      {active > 0 ? (
        <div aria-hidden className="h-px bg-line-subtle">
          <div className="h-px bg-accent transition-[width] duration-200" style={{ width: `${(sent / items.length) * 100}%` }} />
        </div>
      ) : null}
      {collapsed ? null : (
        <ul className="max-h-72 divide-y divide-line-subtle overflow-y-auto overscroll-contain">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-3.5 py-2.5" aria-label={item.file.name}>
              <UploadIcon item={item} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] text-fg">{item.file.name}</p>
                <p className={cn("text-xs", item.status === "failed" ? "text-danger" : "text-fg-faint")}>
                  {item.status === "queued" && `Waiting · ${formatBytes(item.file.size)}`}
                  {item.status === "uploading" && `${Math.round(item.progress * 100)}% · ${formatBytes(item.file.size)}`}
                  {item.status === "processing" && "Making previews…"}
                  {item.status === "done" && (item.warning ?? (item.duplicateOf ? `Added. Looks identical to “${item.duplicateOf.title}”.` : "Added to the library"))}
                  {(item.status === "failed" || item.status === "cancelled") && item.error}
                </p>
                {item.status === "uploading" ? (
                  <div aria-hidden className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-active">
                    <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${item.progress * 100}%` }} />
                  </div>
                ) : null}
              </div>
              {item.status === "uploading" ? (
                <button type="button" aria-label={`Cancel ${item.file.name}`} onClick={() => onCancel(item.id)} className="grid size-6 shrink-0 place-items-center rounded-sm text-fg-faint hover:bg-hover hover:text-fg">
                  <X aria-hidden className="size-3.5" />
                </button>
              ) : null}
              {(item.status === "failed" && !item.permanent) || item.status === "cancelled" ? (
                <button type="button" aria-label={`Retry ${item.file.name}`} onClick={() => onRetry(item.id)} className="grid size-6 shrink-0 place-items-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg">
                  <RotateCw aria-hidden className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadIcon({ item }: { item: UploadItem }) {
  const base = "mt-0.5 grid size-5 shrink-0 place-items-center [&_svg]:size-4";
  if (item.status === "done") {
    return <span className={cn(base, item.duplicateOf || item.warning ? "text-hue-amber" : "text-success")}>{item.duplicateOf ? <Copy aria-hidden /> : <Check aria-hidden />}</span>;
  }
  if (item.status === "failed" || item.status === "cancelled") return <span className={cn(base, "text-danger")}><AlertCircle aria-hidden /></span>;
  if (item.status === "queued") return <span className={cn(base, "text-fg-faint")}><ImageUp aria-hidden /></span>;
  return <span className={cn(base, "text-accent")}><Spinner /></span>;
}
