import type { ReactNode } from "react";
import { Surface } from "@/shared/ui/surface";

/** One titled group of settings: explanation on the left, controls on the right. */
export function SettingsSection({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  /** Optional feedback shown under the description, e.g. a save indicator. */
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-line-subtle py-8 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        <p className="text-[0.8125rem] leading-relaxed text-fg-muted">{description}</p>
        {status ? <div className="mt-1">{status}</div> : null}
      </div>
      <Surface className="p-5">{children}</Surface>
    </section>
  );
}

export function SettingRow({ label, description, control, labelId }: { label: string; description?: string; control: ReactNode; labelId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-subtle py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p id={labelId} className="text-[0.8125rem] font-medium text-fg">
          {label}
        </p>
        {description ? <p className="text-[0.8125rem] text-fg-faint">{description}</p> : null}
      </div>
      {control}
    </div>
  );
}
