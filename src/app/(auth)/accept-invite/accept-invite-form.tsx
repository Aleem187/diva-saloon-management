"use client";

import { useActionState } from "react";

import { acceptInviteAction, type FormState } from "../actions";
import { Flash } from "@/components/ui/flash";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function AcceptInviteForm({ defaultName }: { defaultName: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(acceptInviteAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <TextField
        label="Your name"
        id="fullName"
        name="fullName"
        autoComplete="name"
        defaultValue={defaultName}
        required
        requiredMark={false}
        placeholder="Full name"
        error={state.errors?.fullName}
      />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <TextField
          label="Password"
          id="password"
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
          label="Confirm password"
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          requiredMark={false}
          placeholder="Repeat password"
          error={state.errors?.confirmPassword}
        />
      </div>

      <SubmitButton className="mt-1 w-full" pendingLabel="Setting up...">
        Finish setup
      </SubmitButton>
    </form>
  );
}
