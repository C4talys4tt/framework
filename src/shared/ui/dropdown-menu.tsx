"use client";

import type { ComponentProps } from "react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { cn } from "@/shared/lib/cn";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-50 min-w-56 rounded-md border border-line bg-overlay p-1 shadow-overlay",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-sm px-2 text-[0.8125rem] text-fg outline-none",
        "data-[highlighted]:bg-active data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn("px-2 pb-1 pt-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-fg-faint", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-line-subtle", className)} {...props} />;
}
