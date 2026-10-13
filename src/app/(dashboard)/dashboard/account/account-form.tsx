"use client";

import { useActionState } from "react";

import { updateAccountAction, type AccountFormState } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash } from "@/components/ui/flash";
import { TextField } from "@/components/ui/field";

/*
 * The same form and the same Server Action as before the redesign: name and
 * phone are editable, email is shown read-only and is never submitted
 * (`disabled`). Only the markup changed.
 */
export function AccountForm({
  email,
  fullName,
  phone,
}: {
  email: string;
  fullName: string;
  phone: string;
}) {
  const [state, formAction] = useActionState<AccountFormState, FormData>(
    updateAccountAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <TextField
          label="Full name"
          id="fullName"
          name="fullName"
          defaultValue={fullName}
          error={state.errors?.fullName}
          required
        />
        <TextField
          label="Phone"
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          error={state.errors?.phone}
        />
        <TextField
          label="Email"
          id="email"
          className="col-span-full"
          value={email}
          disabled
          readOnly
          hint="You sign in with this email. Ask the salon owner if it needs to change."
        />
      </div>

      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </form>
  );
}
