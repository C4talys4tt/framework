import { cn } from "@/shared/lib/cn";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-3.5 animate-spin", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
