import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type Tone = "neutral" | "accent";

const tones: Record<Tone, string> = {
  neutral: "border-line text-fg-faint",
  accent: "border-accent-line bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] items-center rounded-xs border px-1.5 font-mono text-[0.625rem] font-medium uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
