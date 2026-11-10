import type { ButtonHTMLAttributes, Ref } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/shared/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium " +
  "transition-[background-color,border-color,color,box-shadow,opacity] duration-150 " +
  "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong shadow-raised",
  secondary: "border border-line bg-raised text-fg hover:border-line-strong hover:bg-overlay shadow-raised",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg",
  danger: "border border-danger/30 bg-danger-soft text-danger hover:border-danger/60",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[0.8125rem]",
  md: "h-8 px-3 text-[0.8125rem]",
  lg: "h-10 px-4 text-sm",
  icon: "size-8",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner, keeps the label for layout, and blocks interaction. */
  pending?: boolean;
  /** Render the child element (e.g. a Link) with button styling. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(base, variants[variant], sizes[size], className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? (
        <>
          <span className="absolute inset-0 grid place-items-center">
            <Spinner />
          </span>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
