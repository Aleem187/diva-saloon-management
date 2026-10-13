import type { ComponentProps } from "react";

import { cn } from "./cn";

/**
 * A shimmering placeholder block. Decorative: pair a group of them with
 * `SkeletonGroup` so assistive tech hears "Loading" once. The shimmer stops
 * for people who ask for reduced motion.
 */
export function Skeleton({ className, style, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-xl bg-[length:200%_100%] bg-linear-to-r from-skeleton via-skeleton-hi to-skeleton motion-safe:animate-[shimmer_1s_linear_infinite]",
        className,
      )}
      style={style}
      {...props}
    />
  );
}

/** Wraps skeletons in a polite live region with a screen-reader-only label. */
export function SkeletonGroup({
  label = "Loading…",
  className,
  children,
  ...props
}: ComponentProps<"div"> & { label?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-4", className)} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
