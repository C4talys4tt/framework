import { cn } from "@/shared/lib/cn";

/** The FRAMEWORK mark: four registration corners around a keyframe. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5", className)}>
      <path
        d="M3 8V4.5A1.5 1.5 0 0 1 4.5 3H8M16 3h3.5A1.5 1.5 0 0 1 21 4.5V8M21 16v3.5a1.5 1.5 0 0 1-1.5 1.5H16M8 21H4.5A1.5 1.5 0 0 1 3 19.5V16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="m12 8.25 3.75 3.75L12 15.75 8.25 12 12 8.25Z" className="fill-accent" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-fg", className)}>
      <LogoMark />
      <span className="text-[0.8125rem] font-semibold tracking-[0.22em]">FRAMEWORK</span>
    </span>
  );
}
