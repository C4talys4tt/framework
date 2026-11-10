"use client";

import { useId, type ReactNode } from "react";
import { Input, type InputProps } from "./input";

type FieldProps = Omit<InputProps, "id" | "aria-invalid" | "aria-describedby"> & {
  label: string;
  hint?: ReactNode;
  error?: string;
};

/** A labelled input with hint and error text wired up for assistive tech. */
export function Field({ label, hint, error, ...inputProps }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-fg">
        {label}
      </label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
      {error ? (
        <p id={errorId} className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-[0.8125rem] text-fg-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
