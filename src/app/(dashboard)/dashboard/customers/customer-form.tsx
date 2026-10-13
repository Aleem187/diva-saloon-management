"use client";

import { useActionState } from "react";

import { saveCustomerAction, type CustomerFormState } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { EditDisclosure } from "@/components/edit-disclosure";
import type { CustomerRow } from "@/lib/types/database";

export function CustomerForm({
  customer,
  inline = false,
}: {
  customer?: CustomerRow;
  /** Show the edit form open on the page instead of behind an "Edit profile" button. */
  inline?: boolean;
}) {
  const [state, formAction] = useActionState<CustomerFormState, FormData>(
    saveCustomerAction,
    {},
  );
  const isEdit = Boolean(customer);
  const uid = customer?.id ?? "new";

  const body = (
    <form action={formAction} className="space-y-4">
      {customer ? <input type="hidden" name="customerId" value={customer.id} /> : null}

      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor={`cust-name-${uid}`} error={state.errors?.fullName}>
          <Input id={`cust-name-${uid}`} name="fullName" defaultValue={customer?.full_name} required />
        </Field>

        <Field
          label="Phone"
          htmlFor={`cust-phone-${uid}`}
          error={state.errors?.phone}
          hint="How this customer is looked up."
        >
          <Input
            id={`cust-phone-${uid}`}
            name="phone"
            type="tel"
            defaultValue={customer?.phone}
            required
            placeholder="+92 300 1234567"
          />
        </Field>

        <Field label="Email (optional)" htmlFor={`cust-email-${uid}`} error={state.errors?.email}>
          <Input
            id={`cust-email-${uid}`}
            name="email"
            type="email"
            defaultValue={customer?.email ?? ""}
          />
        </Field>

        <Field
          label="Date of birth (optional)"
          htmlFor={`cust-dob-${uid}`}
          error={state.errors?.dateOfBirth}
        >
          <Input
            id={`cust-dob-${uid}`}
            name="dateOfBirth"
            type="date"
            defaultValue={customer?.date_of_birth ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Notes"
        htmlFor={`cust-notes-${uid}`}
        error={state.errors?.notes}
        hint="Preferences and reminders. Medical history belongs on a consent form, not here."
      >
        <Textarea
          id={`cust-notes-${uid}`}
          name="notes"
          rows={3}
          defaultValue={customer?.notes}
        />
      </Field>

      <SubmitButton pendingLabel="Saving...">
        {isEdit ? "Save changes" : "Add customer"}
      </SubmitButton>
    </form>
  );

  if (!isEdit || inline) return body;
  return <EditDisclosure label="Edit profile">{body}</EditDisclosure>;
}
