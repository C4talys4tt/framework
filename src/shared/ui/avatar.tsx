import { cn } from "@/shared/lib/cn";

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]!)[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Initials avatar. Decorative: always pair it with the visible name. */
export function Avatar({ name, shape = "circle", className }: { name: string; shape?: "circle" | "square"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid size-6 shrink-0 place-items-center border border-line bg-raised text-[0.625rem] font-semibold tracking-wide text-fg-muted",
        shape === "circle" ? "rounded-full" : "rounded-sm border-accent-line bg-accent-soft text-accent",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
