import {
  Archive,
  BookOpenText,
  Clapperboard,
  FolderKanban,
  Images,
  LayoutDashboard,
  Package,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type ModuleStatus = "available" | "planned";

export type ModuleDefinition = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  status: ModuleStatus;
  /** The roadmap milestone that delivers the module, when one is assigned. */
  milestone: string | null;
  /** Path segment under /w/[workspace]/. Only set for available modules. */
  segment: string | null;
};

/**
 * The product's modules, in sidebar order. This registry is the single source
 * of truth for the sidebar, command palette and overview: a module only
 * becomes navigable by flipping its status and giving it a segment here.
 */
export const MODULES: readonly ModuleDefinition[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Your creative dashboard.",
    icon: LayoutDashboard,
    status: "available",
    milestone: "M1",
    segment: "overview",
  },
  {
    id: "projects",
    label: "Projects",
    description: "Plan and track creative projects from brief to delivery.",
    icon: FolderKanban,
    status: "available",
    milestone: "M2",
    segment: "projects",
  },
  {
    id: "library",
    label: "Visual Library",
    description: "Images, videos, references and moodboards.",
    icon: Images,
    status: "planned",
    milestone: "M3",
    segment: null,
  },
  {
    id: "production",
    label: "Production",
    description: "Storyboards, scenes, shot lists and production planning.",
    icon: Clapperboard,
    status: "planned",
    milestone: "M5",
    segment: null,
  },
  {
    id: "assets",
    label: "Assets",
    description: "Footage, audio, fonts and other creative resources.",
    icon: Package,
    status: "planned",
    milestone: "M4",
    segment: null,
  },
  {
    id: "effects",
    label: "Effects Lab",
    description: "Plugins, presets, expressions and effect recipes.",
    icon: Sparkles,
    status: "planned",
    milestone: "M6",
    segment: null,
  },
  {
    id: "journal",
    label: "Journal",
    description: "Notes, documentation and creative development.",
    icon: BookOpenText,
    status: "planned",
    milestone: "M6",
    segment: null,
  },
  {
    id: "archive",
    label: "Archive",
    description: "Completed and archived projects.",
    icon: Archive,
    status: "planned",
    milestone: null,
    segment: null,
  },
];

export type AvailableModule = ModuleDefinition & { status: "available"; segment: string };

export function isAvailable(module: ModuleDefinition): module is AvailableModule {
  return module.status === "available" && module.segment !== null;
}

export function unavailableLabel(module: ModuleDefinition): string {
  return module.milestone
    ? `${module.label} is not available yet. Planned for milestone ${module.milestone.slice(1)}.`
    : `${module.label} is not available yet.`;
}

export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile", description: "Your name and identity." },
  { id: "appearance", label: "Appearance", description: "Theme, density and motion." },
  { id: "workspace", label: "Workspace", description: "This workspace's name and details." },
  { id: "projects", label: "Projects", description: "Project statuses and categories." },
  { id: "account", label: "Account", description: "Password and sessions." },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export function workspacePath(slug: string, ...segments: string[]): string {
  return ["/w", slug, ...segments].join("/");
}

/** Breadcrumb for a pathname inside a workspace, e.g. ["Settings", "Appearance"]. */
export function describeLocation(pathname: string): string[] {
  const [, scope, , section, sub] = pathname.split("/");
  if (scope !== "w" || !section) return [];
  if (section === "settings") {
    const match = SETTINGS_SECTIONS.find((candidate) => candidate.id === sub);
    return match ? ["Settings", match.label] : ["Settings"];
  }
  const match = MODULES.find((candidate) => candidate.segment === section);
  return match ? [match.label] : [];
}
