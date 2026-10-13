"use client";

import { useActionState } from "react";

import { signInAction, type FormState } from "../actions";
import { Flash } from "@/components/ui/flash";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(signInAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <TextField
        label="Email"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        requiredMark={false}
        placeholder="you@salon.com"
        error={state.errors?.email}
      />

      <TextField
        label="Password"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        requiredMark={false}
        placeholder="Your password"
        error={state.errors?.password}
      />

      <SubmitButton className="mt-1 w-full" pendingLabel="Signing in...">
        Sign in
      </SubmitButton>
    </form>
  );
}
