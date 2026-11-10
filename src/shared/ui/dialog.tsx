"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/shared/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const overlayClassName =
  "fixed inset-0 z-40 bg-scrim backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out";

export function DialogContent({
  title,
  description,
  children,
  className,
  size = "md",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** `lg` is for long forms: wider, higher on screen, and scrolls inside the viewport. */
  size?: "md" | "lg";
}) {
  // Radix only restores focus to a <Dialog.Trigger>. Dialogs here are usually opened
  // from ordinary buttons, so remember what had focus and give it back on close.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClassName} />
      <DialogPrimitive.Content
        onCloseAutoFocus={(event) => {
          const element = opener.current;
          opener.current = null;
          if (element?.isConnected) {
            event.preventDefault();
            element.focus();
          }
        }}
        // Focus the field marked for it rather than the close button, which
        // comes first in the DOM.
        onOpenAutoFocus={(event) => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const target = (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-autofocus]");
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
        className={cn(
          "fixed left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-line bg-overlay p-5 shadow-overlay",
          size === "lg" ? "top-[5vh] max-h-[90dvh] max-w-2xl overflow-y-auto overscroll-contain" : "top-[18vh] max-w-md",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-[0.9375rem] font-semibold tracking-tight text-fg">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-[0.8125rem] leading-relaxed text-fg-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-sm text-fg-faint transition-colors hover:bg-hover hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
