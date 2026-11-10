"use client";

import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/shared/lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border border-line bg-active transition-colors duration-150",
        "data-[state=checked]:border-accent-line data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-[3px] rounded-full bg-fg-muted transition-transform duration-150 ease-out-quint data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-on-accent" />
    </SwitchPrimitive.Root>
  );
}
