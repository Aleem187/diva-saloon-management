import type { ComponentProps, ElementType, ReactNode } from "react";

import { cn } from "./cn";

/**
 * White panel with a hairline border. 14px radius, 20px padding; `lg` is the
 * 16px radius, 28px padding used by the sign-in cards.
 */
export function Card({
  padding = "md",
  className,
  ...props
}: ComponentProps<"div"> & { padding?: "none" | "md" | "lg" }) {
  return (
    <div
      className={cn(
        "min-w-0 border border-line bg-surface",
        padding === "lg" ? "rounded-2xl p-7" : "rounded-[14px]",
        padding === "md" && "p-5",
        className,
      )}
      {...props}
    />
  );
}

/** Section title inside a card: heading font, 16px. */
export function CardTitle({
  as: Tag = "h3",
  className,
  ...props
}: ComponentProps<"h3"> & { as?: ElementType }) {
  return (
    <Tag
      className={cn("mb-3.5 font-heading text-section font-semibold text-ink", className)}
      {...props}
    />
  );
}

/**
 * The top of a card that holds a list or a table and so has no padding of its
 * own: a title, a line of explanation, and optional actions on the right.
 */
export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h3 className="font-heading text-section font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-small text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
