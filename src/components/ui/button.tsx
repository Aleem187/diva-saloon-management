import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "./cn";

export type ButtonVariant = "primary" | "ghost" | "danger" | "success";
export type ButtonSize = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border font-semibold whitespace-nowrap no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:pointer-events-none aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-accent bg-accent text-on-accent hover:border-accent-d hover:bg-accent-d hover:text-on-accent",
  ghost: "border-field bg-surface text-accent hover:bg-soft hover:text-accent-d",
  danger:
    "border-critical-line bg-surface text-critical hover:bg-critical-bg hover:text-critical",
  success: "border-good bg-good text-on-accent hover:opacity-90 hover:text-on-accent",
};

// DESIGN.md: controls are at least 44px tall, small buttons 36px.
const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-[18px]",
  sm: "min-h-9 px-3 text-small",
};

/** The button look, for anything that is not a <button> (a link, a label). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonOwnProps = { variant?: ButtonVariant; size?: ButtonSize };

/**
 * `type` defaults to "button", not "submit": a button inside a form that is
 * meant to submit says so. `loading` disables the button and announces busy.
 */
export function Button({
  variant,
  size,
  loading = false,
  className,
  disabled,
  type = "button",
  children,
  ...props
}: ComponentProps<"button"> & ButtonOwnProps & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

/** A navigation link that looks like a button. */
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonOwnProps) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
