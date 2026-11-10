"use client";

import { useId } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { usePreferences } from "@/modules/preferences/components/preferences-provider";
import type { Density, Theme } from "@/modules/preferences/domain/appearance";
import { SegmentedControl, type SegmentedOption } from "@/shared/ui/segmented-control";
import { Switch } from "@/shared/ui/switch";
import { SaveStatus, type SaveState } from "./save-status";
import { SettingRow, SettingsSection } from "./settings-section";

const THEME_OPTIONS: SegmentedOption<Theme>[] = [
  { value: "dark", label: "Dark", icon: <Moon aria-hidden /> },
  { value: "light", label: "Light", icon: <Sun aria-hidden /> },
  { value: "system", label: "System", icon: <Monitor aria-hidden /> },
];

const DENSITY_OPTIONS: SegmentedOption<Density>[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export function AppearanceSettings() {
  const { appearance, setAppearance, appearanceStatus: status } = usePreferences();
  const themeLabel = useId();
  const densityLabel = useId();
  const motionLabel = useId();

  const state: SaveState =
    status === "saved"
      ? { kind: "saved", message: "Saved to your account" }
      : status === "error"
        ? { kind: "error", message: "Could not save. Your previous appearance was restored." }
        : { kind: "idle" };

  return (
    <SettingsSection
      title="Interface"
      description="Changes apply immediately and follow your account to every device."
      status={<SaveStatus state={state} />}
    >
      <SettingRow
        labelId={themeLabel}
        label="Theme"
        description="System follows your operating system."
        control={
          <SegmentedControl
            aria-labelledby={themeLabel}
            value={appearance.theme}
            onValueChange={(theme) => setAppearance({ theme })}
            options={THEME_OPTIONS}
          />
        }
      />
      <SettingRow
        labelId={densityLabel}
        label="Density"
        description="Compact fits more on screen."
        control={
          <SegmentedControl
            aria-labelledby={densityLabel}
            value={appearance.density}
            onValueChange={(density) => setAppearance({ density })}
            options={DENSITY_OPTIONS}
          />
        }
      />
      <SettingRow
        labelId={motionLabel}
        label="Reduce motion"
        description="Turns off interface animation. Your system setting is always respected."
        control={
          <Switch
            aria-labelledby={motionLabel}
            checked={appearance.reduceMotion}
            onCheckedChange={(reduceMotion) => setAppearance({ reduceMotion })}
          />
        }
      />
    </SettingsSection>
  );
}
