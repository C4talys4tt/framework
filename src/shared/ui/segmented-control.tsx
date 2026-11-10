"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: ReactNode };

/**
 * A single-choice control with radio-group semantics: one tab stop, and the
 * arrow keys both move focus and select, as the ARIA radio pattern specifies.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = options.findIndex((option) => option.value === value);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (current + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (current - 1 + options.length) % options.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = options.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    buttons.current.get(option.value)?.focus();
    if (option.value !== value) onValueChange(option.value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={onKeyDown}
      className={cn("inline-flex gap-0.5 rounded-md border border-line bg-canvas p-0.5", className)}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              if (element) buttons.current.set(option.value, element);
              else buttons.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              if (!checked) onValueChange(option.value);
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[0.8125rem] font-medium transition-colors duration-150 [&_svg]:size-3.5",
              checked ? "bg-active text-fg shadow-raised" : "text-fg-muted hover:text-fg",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
