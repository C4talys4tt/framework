import type { ReactNode } from "react";
import { Surface } from "@/shared/ui/surface";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <Surface className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-[0.8125rem] text-fg-muted">{subtitle}</p>
        </div>
        {children}
      </Surface>
      <p className="text-center text-[0.8125rem] text-fg-muted">{footer}</p>
    </div>
  );
}

export function FormError({ message }: { message: string | undefined }) {
  // The live region stays mounted so screen readers announce new errors.
  return (
    <div role="alert" aria-live="assertive">
      {message ? (
        <p className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger">{message}</p>
      ) : null}
    </div>
  );
}
