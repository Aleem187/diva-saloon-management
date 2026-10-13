"use client";

import { useActionState } from "react";

import { forgotPasswordAction, type FormState } from "../actions";
import { Flash } from "@/components/ui/flash";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(forgotPasswordAction, {});

  if (state.resetRequested) {
    return (
      <Flash tone="success">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1">
          If there is an account for <strong>{state.resetRequested}</strong>, we have sent a link
          to reset its password. The link works once and expires after a while.
        </p>
      </Flash>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <TextField
        label="Email"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email ?? ""}
        required
        requiredMark={false}
        placeholder="you@salon.com"
        error={state.errors?.email}
      />

      <SubmitButton className="mt-1 w-full" pendingLabel="Sending...">
        Send reset link
      </SubmitButton>
    </form>
  );
}
