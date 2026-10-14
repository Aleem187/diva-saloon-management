"use client";

import { useActionState } from "react";

import { changePasswordAction, type AccountFormState } from "./actions";
import { Flash } from "@/components/ui/flash";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function PasswordForm() {
  const [state, formAction] = useActionState<AccountFormState, FormData>(changePasswordAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}

      <TextField
        label="Current password"
        id="current-password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        requiredMark={false}
        error={state.errors?.currentPassword}
      />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <TextField
          label="New password"
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          requiredMark={false}
          minLength={8}
          placeholder="At least 8 characters"
          error={state.errors?.password}
        />
        <TextField
          label="Confirm new password"
          id="confirm-new-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          requiredMark={false}
          error={state.errors?.confirmPassword}
        />
      </div>

      <SubmitButton pendingLabel="Saving...">Change password</SubmitButton>
    </form>
  );
}
