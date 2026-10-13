import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "./cn";

/*
 * Form controls. `Input`, `Select` and `Textarea` are the styled controls;
 * `Field` puts a label, hint and error around one you wire up yourself (the
 * same shape as the legacy `Field`); `TextField`, `SelectField` and
 * `TextareaField` do both and wire the ids for you.
 *
 * DESIGN.md: controls are at least 44px tall, 10px radius, and focus shows a
 * 2px ring.
 */

const CONTROL =
  "w-full rounded-[10px] border border-field bg-surface px-3 py-2.5 text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-head disabled:text-muted read-only:bg-head aria-[invalid=true]:border-critical";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, "min-h-11", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(CONTROL, "min-h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "min-h-[92px] resize-y", className)} {...props} />;
}

/** A file chooser, styled to match the other controls. */
export function FileInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="file"
      className={cn(
        CONTROL,
        "block py-2 text-small file:mr-3 file:rounded-md file:border-0 file:bg-track file:px-3 file:py-1.5 file:text-small file:font-semibold file:text-ink hover:file:bg-line",
        className,
      )}
      {...props}
    />
  );
}

interface FieldChrome {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Show the * beside the label of a required field. Default true. */
  requiredMark?: boolean;
  className?: string;
}

/** Label above, hint or error below. Give the control `id={htmlFor}`. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  requiredMark = true,
  className,
  children,
}: FieldChrome & { htmlFor: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-small font-semibold text-ink">
        {label}
        {required && requiredMark ? (
          <span aria-hidden className="ml-0.5 text-critical">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-fine text-critical-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-fine text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** ids and aria wiring shared by the three combined fields. */
function useWiring(id: string | undefined, hint: ReactNode, error: ReactNode) {
  const auto = useId();
  const fieldId = id ?? auto;
  return {
    fieldId,
    control: {
      id: fieldId,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined,
    } as const,
  };
}

export function TextField({
  label,
  hint,
  error,
  required,
  requiredMark,
  className,
  id,
  ...props
}: FieldChrome & Omit<ComponentProps<"input">, "className">) {
  const { fieldId, control } = useWiring(id, hint, error);
  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error} required={required} requiredMark={requiredMark} className={className}>
      <Input required={required} {...control} {...props} />
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  requiredMark,
  className,
  id,
  children,
  ...props
}: FieldChrome & Omit<ComponentProps<"select">, "className">) {
  const { fieldId, control } = useWiring(id, hint, error);
  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error} required={required} requiredMark={requiredMark} className={className}>
      <Select required={required} {...control} {...props}>
        {children}
      </Select>
    </Field>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  required,
  requiredMark,
  className,
  id,
  ...props
}: FieldChrome & Omit<ComponentProps<"textarea">, "className">) {
  const { fieldId, control } = useWiring(id, hint, error);
  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error} required={required} requiredMark={requiredMark} className={className}>
      <Textarea required={required} {...control} {...props} />
    </Field>
  );
}
