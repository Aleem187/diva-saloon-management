"use client";

import { useActionState } from "react";

import { generatePayrollAction, type PayrollFormState } from "./actions";
import { Field, Input } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit-button";

export function GeneratePayrollForm() {
  const [state, formAction] = useActionState<PayrollFormState, FormData>(
    generatePayrollAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="payroll-from" error={state.errors?.startsOn} required>
          <Input id="payroll-from" name="startsOn" type="date" required />
        </Field>
        <Field label="End date" htmlFor="payroll-to" error={state.errors?.endsOn} required>
          <Input id="payroll-to" name="endsOn" type="date" required />
        </Field>
      </div>

      <Field label="Notes" htmlFor="payroll-notes" error={state.errors?.notes} hint="Optional. Shown with the period.">
        <Input id="payroll-notes" name="notes" />
      </Field>

      <SubmitButton pendingLabel="Calculating...">Generate draft</SubmitButton>
    </form>
  );
}
