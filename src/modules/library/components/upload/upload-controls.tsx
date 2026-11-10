"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ImageUp, Upload } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button, type ButtonProps } from "@/shared/ui/button";
import { ACCEPT_ATTRIBUTE } from "../../domain/files";
import { useUploads, type UploadTarget } from "./upload-provider";

/** Opens the file picker. With `autoOpenParam`, `?upload=1` in the URL opens it once (from the palette). */
export function UploadButton({
  target,
  children = "Upload",
  autoOpenParam = false,
  ...props
}: { target: UploadTarget; children?: ReactNode; autoOpenParam?: boolean } & Omit<ButtonProps, "onClick" | "type">) {
  const input = useRef<HTMLInputElement>(null);
  const { enqueue } = useUploads();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!autoOpenParam || params.get("upload") !== "1") return;
    input.current?.click();
    const next = new URLSearchParams(params);
    next.delete("upload");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [autoOpenParam, params, pathname, router]);

  return (
    <>
      <Button variant="primary" {...props} onClick={() => input.current?.click()}>
        <Upload aria-hidden className="size-3.5" />
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="upload-input"
        onChange={(event) => {
          if (event.target.files?.length) enqueue(event.target.files, target);
          event.target.value = "";
        }}
      />
    </>
  );
}

/** Accepts files dropped anywhere over its children, with a clear target overlay. */
export function UploadDropzone({ target, children, className, label = "Drop images to add them to the library" }: { target: UploadTarget; children: ReactNode; className?: string; label?: string }) {
  const { enqueue } = useUploads();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        if (event.dataTransfer.files.length) enqueue(event.dataTransfer.files, target);
      }}
    >
      {children}
      {over ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-scrim/70 backdrop-blur-[2px] animate-fade-in">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-accent-line bg-overlay/90 px-10 py-8 text-center shadow-overlay">
            <ImageUp className="size-6 text-accent" />
            <p className="text-sm font-medium text-fg">{label}</p>
            <p className="text-xs text-fg-faint">JPEG, PNG, WebP, GIF, AVIF or TIFF, up to 40 MB each</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
