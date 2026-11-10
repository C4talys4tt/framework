"use client";

import { useState } from "react";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent } from "./dialog";

/**
 * Asks before something consequential. `onConfirm` returns an error message to
 * keep the dialog open and show it, or nothing to close.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<string | undefined>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        {/* Mounted only while open, so a previous error never lingers. */}
        <ConfirmBody confirmLabel={confirmLabel} tone={tone} onConfirm={onConfirm} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  confirmLabel,
  tone,
  onConfirm,
  onDone,
}: {
  confirmLabel: string;
  tone: "danger" | "primary";
  onConfirm: () => Promise<string | undefined>;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    setPending(true);
    setError(undefined);
    try {
      const message = await onConfirm();
      if (message) setError(message);
      else onDone();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button variant={tone === "danger" ? "danger" : "primary"} pending={pending} onClick={confirm} data-autofocus>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
