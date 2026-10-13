import type { ComponentProps } from "react";

import { cn } from "./cn";

/**
 * A real <table> in a bordered, horizontally scrolling box, so a wide table
 * scrolls on a phone instead of breaking the page. The box is focusable and
 * labelled, which lets a keyboard user scroll it.
 *
 * Compose with TableHead, TableBody, TableFoot, TableRow, TableHeader and
 * TableCell. None of them is a client component, so server pages can use them.
 */
export function Table({
  label,
  className,
  children,
  ...props
}: ComponentProps<"table"> & { label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-[14px] border border-line bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <table className={cn("w-full border-collapse text-left", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHead(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TableFoot({ className, ...props }: ComponentProps<"tfoot">) {
  return <tfoot className={cn("font-semibold", className)} {...props} />;
}

export function TableRow({
  selected = false,
  className,
  ...props
}: ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        "border-b border-line-soft last:border-b-0",
        selected && "bg-soft",
        className,
      )}
      {...props}
    />
  );
}

export function TableHeader({
  align = "left",
  className,
  ...props
}: ComponentProps<"th"> & { align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cn(
        "bg-head px-4 py-3 text-fine font-semibold tracking-[0.05em] text-muted uppercase",
        align === "right" && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  align = "left",
  className,
  ...props
}: ComponentProps<"td"> & { align?: "left" | "right" }) {
  return (
    <td
      className={cn("px-4 py-3", align === "right" && "text-right tabular-nums", className)}
      {...props}
    />
  );
}
