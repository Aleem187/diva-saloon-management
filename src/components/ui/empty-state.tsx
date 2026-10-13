import type { ReactNode } from "react";

import { cn } from "./cn";

/** Nothing here yet: a dashed box that says why, and optionally what to do. */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-field bg-surface p-7 text-center text-muted",
        className,
      )}
    >
      {title ? <p className="font-heading font-semibold text-ink">{title}</p> : null}
      {children ? <div>{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
