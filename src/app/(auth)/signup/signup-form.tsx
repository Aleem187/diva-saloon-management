"use client";

import { useActionState } from "react";

import { signUpAction, type FormState } from "../actions";
import { LocaleFields } from "@/components/locale-fields";
import { Flash } from "@/components/ui/flash";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function SignupForm() {
  const [state, formAction] = useActionState<FormState, FormData>(signUpAction, {});

  // React clears an uncontrolled form once its action resolves, so a rejected
  // submission is re-seeded from what was typed rather than coming back blank.
  const was = (name: string) => state.values?.[name] ?? "";

  if (state.pendingConfirmation) {
    return (
      <Flash tone="success">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1">
          We sent a confirmation link to <strong>{state.pendingConfirmation}</strong>. Your
          salon is ready as soon as you confirm.
        </p>
      </Flash>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Flash tone="accent">
        <strong>14-day free trial</strong> · then $20/month
      </Flash>

      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <TextField
          label="Salon name"
          id="salonName"
          name="salonName"
          defaultValue={was("salonName")}
          required
          requiredMark={false}
          placeholder="e.g. Velvet Room Salon"
          error={state.errors?.salonName}
        />

        <SelectField
          label="Business type"
          id="businessType"
          name="businessType"
          defaultValue={was("businessType") || "salon"}
          error={state.errors?.businessType}
        >
          <option value="salon">Salon</option>
          <option value="aesthetic_clinic">Aesthetic clinic</option>
        </SelectField>

        <TextField
          label="Your name"
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={was("fullName")}
          required
          requiredMark={false}
          placeholder="Owner's full name"
          className="col-span-full"
          error={state.errors?.fullName}
        />

        <TextField
          label="Email"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={was("email")}
          required
          requiredMark={false}
          placeholder="you@salon.com"
          error={state.errors?.email}
        />

        {/* Never echoed back, for the obvious reason. */}
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

        <div className="col-span-full">
          <LocaleFields
            idPrefix="signup"
            defaultCountry={was("country")}
            defaultCurrency={was("currency")}
            defaultTimezone={was("timezone")}
            errors={state.errors ?? {}}
          />
        </div>
      </div>

      <SubmitButton className="mt-1 w-full" pendingLabel="Creating your salon...">
        Start 14-day free trial
      </SubmitButton>
    </form>
  );
}
