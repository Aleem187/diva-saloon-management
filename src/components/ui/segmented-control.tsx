"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "./cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * A grey track with one white selected segment: filters, ranges, payment
 * method. It is a radio group, so Tab moves into and out of it as one stop,
 * and the arrow keys move the selection, as with native radios.
 *
 * Controlled (`value` + `onValueChange`) or uncontrolled (`defaultValue`).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  defaultValue,
  onValueChange,
  "aria-label": ariaLabel,
  fullWidth = false,
  className,
}: {
  options: readonly SegmentOption<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  "aria-label": string;
  fullWidth?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState<T | undefined>(defaultValue ?? options[0]?.value);
  const current = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(next: T) {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();

    // Skip disabled segments, wrapping at the ends.
    for (let i = 1; i <= options.length; i++) {
      const at = (index + step * i + options.length * i) % options.length;
      if (!options[at].disabled) {
        select(options[at].value);
        refs.current[at]?.focus();
        return;
      }
    }
  }

  // The tab stop is the selected segment, or the first enabled one.
  const stop = options.findIndex((o) => o.value === current && !o.disabled);
  const tabStop = stop >= 0 ? stop : options.findIndex((o) => !o.disabled);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-track p-[3px]",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === current;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => select(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-small font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
              fullWidth && "flex-1",
              selected
                ? "bg-surface text-accent-d shadow-sm"
                : "text-neutral-fg hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
