"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  BringToFront,
  Check,
  ChevronDown,
  CloudOff,
  Copy,
  Hand,
  ImagePlus,
  Keyboard,
  Maximize,
  Minus,
  MousePointer2,
  MoreHorizontal,
  Paintbrush,
  Pencil,
  Plus,
  Redo2,
  SendToBack,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Dialog, DialogContent } from "@/shared/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Kbd } from "@/shared/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Spinner } from "@/shared/ui/spinner";
import { Tooltip } from "@/shared/ui/tooltip";
import { BACKGROUNDS, FONT_SIZES, TEXT_COLORS, type TextStyle } from "../../domain/moodboard";
import type { SaveStatus } from "./use-autosave";

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
  side = "bottom",
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  return (
    <Tooltip
      side={side}
      content={
        <>
          {label}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </>
      }
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:size-4",
          active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;

export function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  const content: Record<SaveStatus, ReactNode> = {
    saved: (
      <>
        <Check aria-hidden className="size-3.5 text-success" />
        Saved
      </>
    ),
    unsaved: (
      <>
        <span aria-hidden className="size-1.5 rounded-full bg-hue-amber" />
        Unsaved changes
      </>
    ),
    saving: (
      <>
        <Spinner className="size-3" />
        Saving…
      </>
    ),
    retrying: (
      <>
        <CloudOff aria-hidden className="size-3.5 text-hue-amber" />
        Not saved, retrying
      </>
    ),
    failed: (
      <>
        <CloudOff aria-hidden className="size-3.5 text-danger" />
        Not saved
      </>
    ),
    conflict: (
      <>
        <CloudOff aria-hidden className="size-3.5 text-danger" />
        Conflict
      </>
    ),
  };
  const canRetry = status === "retrying" || status === "failed";
  return (
    <div className="flex items-center gap-1.5">
      <p role="status" aria-live="polite" title={error ?? undefined} data-save-status={status} className="flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted">
        {content[status]}
      </p>
      {canRetry ? (
        <button type="button" onClick={onRetry} className="h-6 rounded-sm px-1.5 text-xs font-medium text-accent hover:bg-hover">
          Retry now
        </button>
      ) : null}
    </div>
  );
}

export type Tool = "select" | "hand";

export function EditorToolbar({
  name,
  project,
  boardsHref,
  projectHref,
  tool,
  onTool,
  onAddText,
  panelOpen,
  onTogglePanel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  background,
  onBackground,
  status,
  error,
  onRetry,
  onEditDetails,
  onDuplicate,
  onDelete,
  onShortcuts,
}: {
  name: string;
  project: { id: string; name: string } | null;
  boardsHref: string;
  projectHref: string | null;
  tool: Tool;
  onTool: (tool: Tool) => void;
  onAddText: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  background: string;
  onBackground: (color: string, final: boolean) => void;
  status: SaveStatus;
  error: string | null;
  onRetry: () => void;
  onEditDetails: () => void;
  onDuplicate: () => void;
  onDelete: (() => void) | null;
  onShortcuts: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line-subtle bg-surface px-2">
      <Tooltip side="bottom" content="All moodboards">
        <Link href={boardsHref} aria-label="Back to moodboards" className="grid size-8 shrink-0 place-items-center rounded-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
      </Tooltip>
      <div className="flex min-w-0 items-center gap-2 pl-1 pr-2">
        <button type="button" onClick={onEditDetails} className="group flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 hover:bg-hover" aria-label={`Moodboard details: ${name}`}>
          <h1 className="truncate text-[0.8125rem] font-semibold text-fg">{name}</h1>
          <Pencil aria-hidden className="size-3 shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
        {project && projectHref ? (
          <Link href={projectHref} className="hidden max-w-40 truncate rounded-full border border-line px-2 py-0.5 text-[0.6875rem] text-fg-muted transition-colors hover:border-line-strong hover:text-fg md:block">
            {project.name}
          </Link>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-0.5 sm:ml-0 sm:flex-1 sm:justify-center">
        <div role="group" aria-label="Tools" className="flex items-center gap-0.5">
          <ToolButton label="Select" shortcut="V" active={tool === "select"} onClick={() => onTool("select")}>
            <MousePointer2 aria-hidden />
          </ToolButton>
          <ToolButton label="Pan" shortcut="H" active={tool === "hand"} onClick={() => onTool("hand")}>
            <Hand aria-hidden />
          </ToolButton>
          <ToolButton label="Add text" shortcut="T" onClick={onAddText}>
            <Type aria-hidden />
          </ToolButton>
          <ToolButton label="Add images from the library" shortcut="I" active={panelOpen} onClick={onTogglePanel}>
            <ImagePlus aria-hidden />
          </ToolButton>
          <BackgroundPicker value={background} onChange={onBackground} />
        </div>
        <Divider />
        <ToolButton label="Undo" shortcut={`${MOD} Z`} disabled={!canUndo} onClick={onUndo}>
          <Undo2 aria-hidden />
        </ToolButton>
        <ToolButton label="Redo" shortcut={`${MOD} ⇧ Z`} disabled={!canRedo} onClick={onRedo}>
          <Redo2 aria-hidden />
        </ToolButton>
        <Divider />
        <div className="hidden items-center sm:flex">
          <ToolButton label="Zoom out" shortcut="−" onClick={onZoomOut}>
            <Minus aria-hidden />
          </ToolButton>
          <Tooltip side="bottom" content={<>Reset to 100% <Kbd>0</Kbd></>}>
            <button type="button" onClick={onZoomReset} aria-label={`Zoom ${Math.round(zoom * 100)}%. Reset to 100%`} className="h-8 w-12 rounded-sm font-mono text-[0.6875rem] text-fg-muted hover:bg-hover hover:text-fg">
              {Math.round(zoom * 100)}%
            </button>
          </Tooltip>
          <ToolButton label="Zoom in" shortcut="+" onClick={onZoomIn}>
            <Plus aria-hidden />
          </ToolButton>
          <ToolButton label="Fit to content" shortcut="1" onClick={onFit}>
            <Maximize aria-hidden />
          </ToolButton>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="hidden px-2 md:block">
          <SaveIndicator status={status} error={error} onRetry={onRetry} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More moodboard actions" className="grid size-8 place-items-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg data-[state=open]:bg-hover">
              <MoreHorizontal aria-hidden className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEditDetails}>
              <Pencil aria-hidden />
              Name, description and project…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy aria-hidden />
              Duplicate board
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onShortcuts}>
              <Keyboard aria-hidden />
              Keyboard shortcuts
            </DropdownMenuItem>
            {onDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDelete} className="text-danger [&_svg]:!text-danger">
                  <Trash2 aria-hidden />
                  Delete board…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function BackgroundPicker({ value, onChange }: { value: string; onChange: (color: string, final: boolean) => void }) {
  return (
    <Popover>
      <Tooltip side="bottom" content="Canvas background">
        <PopoverTrigger asChild>
          <button type="button" aria-label="Canvas background" className="grid size-8 place-items-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg data-[state=open]:bg-hover">
            <span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ backgroundColor: value }} />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="center" className="w-56 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-fg-faint">
          <Paintbrush aria-hidden className="size-3" />
          Background
        </p>
        <div role="radiogroup" aria-label="Background colour" className="grid grid-cols-6 gap-1.5">
          {BACKGROUNDS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value === option.value}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange(option.value, true)}
              className={cn("size-7 rounded-full border border-line-strong transition-shadow", value === option.value && "ring-2 ring-accent ring-offset-2 ring-offset-overlay")}
              style={{ backgroundColor: option.value }}
            />
          ))}
        </div>
        <label className="mt-3 flex items-center justify-between gap-2 text-[0.8125rem] text-fg-muted">
          Custom
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value.toLowerCase(), false)}
            onBlur={(event) => onChange(event.target.value.toLowerCase(), true)}
            className="h-7 w-12 cursor-pointer rounded-sm border border-line bg-transparent"
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}

/** Actions for the current selection, floating at the bottom of the canvas. */
export function ContextBar({
  count,
  textStyle,
  onTextStyle,
  onArrange,
  onDuplicate,
  onDelete,
  onEditText,
  openHref,
}: {
  count: number;
  textStyle: TextStyle | null;
  onTextStyle: (patch: Partial<TextStyle>) => void;
  onArrange: (how: "front" | "back" | "forward" | "backward") => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEditText: (() => void) | null;
  openHref: string | null;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-line bg-overlay/95 p-1 shadow-overlay backdrop-blur animate-pop-in"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="px-2 text-xs text-fg-muted">{count === 1 ? "1 item" : `${count} items`}</span>
      {textStyle ? (
        <>
          <Divider />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Font size ${textStyle.fontSize}`} className="flex h-8 items-center gap-1 rounded-sm px-2 font-mono text-xs text-fg-muted hover:bg-hover hover:text-fg">
                {textStyle.fontSize}
                <ChevronDown aria-hidden className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="min-w-24">
              {FONT_SIZES.map((size) => (
                <DropdownMenuItem key={size} onSelect={() => onTextStyle({ fontSize: size })} className="font-mono">
                  {size}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolButton side="top" label="Bold" active={textStyle.weight === "bold"} onClick={() => onTextStyle({ weight: textStyle.weight === "bold" ? "medium" : "bold" })}>
            <span aria-hidden className="text-sm font-bold">B</span>
          </ToolButton>
          {(["left", "center", "right"] as const).map((align) => {
            const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
            return (
              <ToolButton side="top" key={align} label={`Align ${align}`} active={textStyle.align === align} onClick={() => onTextStyle({ align })}>
                <Icon aria-hidden />
              </ToolButton>
            );
          })}
          <div role="radiogroup" aria-label="Text colour" className="flex items-center gap-1 px-1.5">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={textStyle.color === color}
                aria-label={`Text colour ${color}`}
                onClick={() => onTextStyle({ color })}
                className={cn("size-4 rounded-full border border-line-strong", textStyle.color === color && "ring-2 ring-accent ring-offset-1 ring-offset-overlay")}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          {onEditText ? (
            <ToolButton side="top" label="Edit text" shortcut="Enter" onClick={onEditText}>
              <Pencil aria-hidden />
            </ToolButton>
          ) : null}
        </>
      ) : null}
      <Divider />
      <ToolButton side="top" label="Bring to front" shortcut={`${MOD} ]`} onClick={() => onArrange("front")}>
        <BringToFront aria-hidden />
      </ToolButton>
      <ToolButton side="top" label="Send to back" shortcut={`${MOD} [`} onClick={() => onArrange("back")}>
        <SendToBack aria-hidden />
      </ToolButton>
      <ToolButton side="top" label="Duplicate" shortcut={`${MOD} D`} onClick={onDuplicate}>
        <Copy aria-hidden />
      </ToolButton>
      {openHref ? (
        <Tooltip side="top" content="Open reference">
          <Link href={openHref} aria-label="Open reference" className="grid size-8 place-items-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg">
            <ImagePlus aria-hidden className="size-4 rotate-0" />
          </Link>
        </Tooltip>
      ) : null}
      <ToolButton side="top" label="Delete" shortcut="⌫" onClick={onDelete}>
        <Trash2 aria-hidden />
      </ToolButton>
    </div>
  );
}

export function Banner({ tone, children, actions }: { tone: "warning" | "danger" | "info"; children: ReactNode; actions?: ReactNode }) {
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn(
        "pointer-events-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3.5 py-2.5 text-[0.8125rem] shadow-overlay backdrop-blur animate-pop-in",
        tone === "danger" && "border-danger/40 bg-overlay/95 text-fg",
        tone === "warning" && "border-hue-amber/40 bg-overlay/95 text-fg",
        tone === "info" && "border-line bg-overlay/95 text-fg",
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

const SHORTCUTS: [string, string[]][] = [
  ["Select tool / pan tool", ["V", "H"]],
  ["Pan while held", ["Space"]],
  ["Add text", ["T"]],
  ["Library panel", ["I"]],
  ["Zoom in / out", ["+", "−"]],
  ["Zoom to 100% / fit", ["0", "1"]],
  ["Zoom at pointer", [MOD, "scroll"]],
  ["Undo / redo", [MOD, "Z", "/", MOD, "⇧", "Z"]],
  ["Duplicate", [MOD, "D"]],
  ["Delete", ["⌫"]],
  ["Select all", [MOD, "A"]],
  ["Add to selection", ["⇧", "click"]],
  ["Nudge (10 with ⇧)", ["←", "↑", "→", "↓"]],
  ["Forward / backward", ["]", "["]],
  ["Front / back", [MOD, "]", "/", MOD, "["]],
  ["Edit text", ["Enter"]],
  ["Free resize (images)", ["⇧", "drag corner"]],
  ["Save now", [MOD, "S"]],
  ["Deselect / stop editing", ["Esc"]],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Moodboard shortcuts" size="lg">
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {SHORTCUTS.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-[0.8125rem]">
              <dt className="text-fg-muted">{label}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {keys.map((key, index) => (key === "/" ? <span key={index} className="text-fg-faint">/</span> : <Kbd key={index}>{key}</Kbd>))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
