import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

/**
 * A page body beside a panel: the main content grows, the panel keeps at least
 * ~300px, and on a narrow screen the panel wraps below.
 */
export function Split({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-start gap-4", className)} {...props} />;
}

export function SplitMain({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-w-0 flex-[999_1_560px]", className)} {...props} />;
}

/**
 * A right-hand card for previews and edit forms. It is a landmark (`aside`)
 * named by `title`, or by `aria-label` when there is no visible title.
 */
export function SidePanel({
  title,
  actions,
  className,
  children,
  ...props
}: Omit<ComponentProps<"aside">, "title"> & { title?: ReactNode; actions?: ReactNode }) {
  return (
    <aside
      className={cn(
        "flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-[14px] border border-line bg-surface p-5",
        className,
      )}
      {...props}
    >
      {title || actions ? (
        <div className="flex items-center justify-between gap-3">
          {title ? (
            <h2 className="font-heading text-section font-semibold text-ink">{title}</h2>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      {children}
    </aside>
  );
}
