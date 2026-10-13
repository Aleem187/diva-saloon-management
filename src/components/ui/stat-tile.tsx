import type { ReactNode } from "react";

import { Card } from "./card";
import { cn } from "./cn";

export type StatTone = "default" | "good" | "critical";

const TONES: Record<StatTone, string> = {
  default: "text-ink",
  good: "text-good-fg",
  critical: "text-critical-fg",
};

/**
 * A KPI: a small label over a large figure, with an optional line under it
 * (a delta, a caption). `tone` colours the figure only.
 */
export function StatTile({
  label,
  value,
  hint,
  hintTone = "muted",
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  hintTone?: "muted" | "good" | "critical";
  tone?: StatTone;
  className?: string;
}) {
  return (
    <Card className={className}>
      <p className="text-small text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-heading text-kpi font-semibold tracking-[-0.01em] tabular-nums",
          TONES[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={cn(
            "mt-1 text-fine",
            hintTone === "muted" && "text-muted",
            hintTone === "good" && "font-semibold text-good-fg",
            hintTone === "critical" && "font-semibold text-critical-fg",
          )}
        >
          {hint}
        </p>
      ) : null}
    </Card>
  );
}
