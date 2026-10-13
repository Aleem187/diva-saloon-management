"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "./cn";

/**
 * A 40x22 on/off toggle, green when on. Space and Enter toggle it (it is a
 * real <button role="switch">). Pass `name` to submit the state with a form
 * as "true" / "false".
 */
export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  name,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Visible text beside the toggle. Omit it and pass `aria-label` instead. */
  label?: ReactNode;
  name?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
  const labelId = useId();

  function toggle() {
    const next = !on;
    if (checked === undefined) setInner(next);
    onCheckedChange?.(next);
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={on ? "true" : "false"} /> : null}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "inline-flex min-h-10 items-center gap-2.5 rounded-lg font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative inline-block h-[22px] w-10 flex-none rounded-full transition-colors",
            on ? "bg-good" : "bg-field",
          )}
        >
          <span
            className={cn(
              "absolute top-[3px] size-4 rounded-full bg-surface transition-[left]",
              on ? "left-[21px]" : "left-[3px]",
            )}
          />
        </span>
        {label ? <span id={labelId}>{label}</span> : null}
      </button>
    </>
  );
}
