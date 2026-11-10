"use client";

import { LogOut } from "lucide-react";
import { useShell } from "@/modules/shell/shell-context";
import { Button } from "@/shared/ui/button";

export function SignOutButton() {
  const { signOut } = useShell();
  return (
    <Button onClick={signOut}>
      <LogOut aria-hidden className="size-3.5 text-fg-muted" />
      Sign out
    </Button>
  );
}
