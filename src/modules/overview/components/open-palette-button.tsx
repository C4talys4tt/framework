"use client";

import { Command } from "lucide-react";
import { useShell } from "@/modules/shell/shell-context";
import { Button } from "@/shared/ui/button";
import { Kbd } from "@/shared/ui/kbd";

export function OpenPaletteButton() {
  const { openCommandPalette } = useShell();
  return (
    <Button onClick={openCommandPalette}>
      <Command aria-hidden className="size-3.5 text-fg-muted" />
      Command palette
      <Kbd aria-hidden className="-mr-1 ml-1 bg-canvas">
        ⌘K
      </Kbd>
    </Button>
  );
}
