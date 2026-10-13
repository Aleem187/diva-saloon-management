import type { ComponentProps } from "react";

import { cn } from "./cn";

export type PillTone = "good" | "warning" | "critical" | "info" | "neutral" | "accent";

const TONES: Record<PillTone, string> = {
  good: "bg-good-bg text-good-fg",
  warning: "bg-warning-bg text-warning-fg",
  critical: "bg-critical-bg text-critical-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-neutral-bg text-neutral-fg",
  accent: "bg-soft text-accent-d",
};

/**
 * A small status label. Colour is never the only signal: the text always says
 * what the state is.
 */
export function Pill({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: PillTone }) {
  return (
    <span
      className={cn(
        "inline-block w-max rounded-full px-2.5 py-[3px] text-fine font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
