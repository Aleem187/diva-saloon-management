import type { ReactNode } from "react";

import { cn } from "./cn";

export type FlashTone = "success" | "error" | "warning" | "info" | "accent";

const TONES: Record<FlashTone, string> = {
  success: "bg-good-bg text-good-fg",
  error: "bg-critical-bg text-critical-fg",
  warning: "bg-warning-bg text-warning-fg",
  info: "bg-info-bg text-info-fg",
  accent: "bg-soft text-accent-d",
};

/**
 * The banner at the top of a page after an action: green for success, red for
 * an error. Errors are announced assertively (`role="alert"`), the rest
 * politely (`role="status"`). Pass `onDismiss` from a client component to
 * show a close button.
 */
export function Flash({
  tone = "success",
  onDismiss,
  className,
  children,
}: {
  tone?: FlashTone;
  onDismiss?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl px-3.5 py-3 text-small",
        TONES[tone],
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-1 -mr-1.5 grid size-8 flex-none place-items-center rounded-lg hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
    </div>
  );
}
