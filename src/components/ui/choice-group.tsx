"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn } from "./cn";

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  /** Something to show above the label: swatches, a sample. */
  preview?: ReactNode;
  /** Style for the label itself, e.g. to set it in the font it names. */
  labelStyle?: CSSProperties;
}

/**
 * A group of cards of which exactly one is chosen: colour scheme, fonts.
 *
 * Built on real radio inputs (visually hidden), so it is a native radio group:
 * the arrow keys move the choice, the choice submits with the form under
 * `name`, and a screen reader hears "radio button, 1 of 6". The chosen card is
 * marked with a ring, a tint and a tick, not by colour alone.
 */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onValueChange,
  minWidth = 170,
  className,
}: {
  name: string;
  /** Names the group for assistive tech. Shown to everyone else by the caller. */
  legend: string;
  options: readonly Choice<T>[];
  value: T;
  onValueChange: (value: T) => void;
  minWidth?: number;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{legend}</legend>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}
      >
        {options.map((option) => (
          <label key={option.value} className="relative block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              className="peer sr-only"
            />
            <span className="flex h-full flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-3.5 transition-colors hover:border-ring peer-checked:border-accent peer-checked:bg-soft peer-checked:shadow-[inset_0_0_0_1px_var(--accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {option.preview}
              <span className="min-w-0">
                <strong className="block" style={option.labelStyle}>
                  {option.label}
                </strong>
                {option.description ? (
                  <span className="block text-small text-muted">{option.description}</span>
                ) : null}
              </span>
            </span>
            <span
              aria-hidden
              className="absolute top-2.5 right-2.5 hidden size-[22px] place-items-center rounded-full bg-accent text-fine font-bold text-on-accent peer-checked:grid"
            >
              ✓
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
