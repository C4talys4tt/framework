"use client";

import type { ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  side = "right",
  children,
}: {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="z-50 flex max-w-64 items-center gap-2 rounded-sm border border-line bg-overlay px-2 py-1 text-xs text-fg shadow-overlay animate-fade-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
