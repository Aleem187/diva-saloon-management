"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

import { Button } from "./button";

/**
 * Submit button for the redesign kit: disables itself and shows a spinner while
 * its enclosing form's action is in flight. Must be rendered inside the form.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "loading"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending} {...props}>
      {pending ? (pendingLabel ?? "Working...") : children}
    </Button>
  );
}
