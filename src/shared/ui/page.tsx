import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** `wide` is for image-heavy pages (the Visual Library), which benefit from the whole screen. */
export function PageContainer({ children, className, width = "default" }: { children: ReactNode; className?: string; width?: "default" | "wide" }) {
  return (
    <div className={cn("mx-auto w-full px-5 py-8 md:px-10 md:py-12", width === "wide" ? "max-w-[100rem]" : "max-w-5xl", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5">
      {eyebrow ? <p className="min-h-4 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-fg-faint">{eyebrow}</p> : null}
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-fg">{title}</h1>
      {description ? <p className="max-w-xl text-sm leading-relaxed text-fg-muted">{description}</p> : null}
    </header>
  );
}

export function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-fg-faint">{title}</h2>
      {aside ? <div className="text-xs text-fg-faint">{aside}</div> : null}
    </div>
  );
}
