"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { LIMITS, type CustomField } from "../domain/project";

/** Free-form project details such as "Frame rate: 24 fps". Blank rows are ignored on save. */
export function CustomFieldsEditor({
  value,
  onChange,
  error,
}: {
  value: CustomField[];
  onChange: (fields: CustomField[]) => void;
  error?: string;
}) {
  function update(index: number, patch: Partial<CustomField>) {
    onChange(value.map((field, position) => (position === index ? { ...field, ...patch } : field)));
  }

  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="text-[0.8125rem] font-medium text-fg">Custom details</legend>
      <p className="-mt-1 text-[0.8125rem] text-fg-faint">Anything worth recording: frame rate, resolution, deliverables, codec.</p>
      {value.map((field, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2">
          <Input
            aria-label={`Detail ${index + 1} name`}
            placeholder="Name"
            value={field.key}
            maxLength={LIMITS.fieldKey}
            autoComplete="off"
            onChange={(event) => update(index, { key: event.target.value })}
          />
          <Input
            aria-label={`Detail ${index + 1} value`}
            placeholder="Value"
            value={field.value}
            maxLength={LIMITS.fieldValue}
            autoComplete="off"
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove detail ${index + 1}`}
            onClick={() => onChange(value.filter((_, position) => position !== index))}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={value.length >= LIMITS.fieldsPerProject}
          onClick={() => onChange([...value, { key: "", value: "" }])}
        >
          <Plus aria-hidden className="size-3.5" />
          Add detail
        </Button>
      </div>
    </fieldset>
  );
}
