import { Check } from "lucide-react";

export type SaveState = { kind: "idle" } | { kind: "saved"; message: string } | { kind: "error"; message: string };

/** Inline, announced feedback next to a form's submit button. */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <p role="status" aria-live="polite" className="min-h-5 text-[0.8125rem]">
      {state.kind === "saved" ? (
        <span className="inline-flex animate-fade-in items-center gap-1.5 text-success">
          <Check aria-hidden className="size-3.5" />
          {state.message}
        </span>
      ) : null}
      {state.kind === "error" ? <span className="text-danger">{state.message}</span> : null}
    </p>
  );
}
