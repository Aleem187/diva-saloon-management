"use client";

import { useActionState } from "react";

import { createBranchAction, updateBranchAction } from "./branch-actions";
import type { TeamFormState } from "./actions";
import { Field, Input } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit-button";
import type { BranchRow } from "@/lib/types/database";

/** Add a branch, or (with `branch`) edit one's name and address. */
export function BranchForm({ branch }: { branch?: BranchRow }) {
  const [state, formAction] = useActionState<TeamFormState, FormData>(
    branch ? updateBranchAction : createBranchAction,
    {},
  );
  const id = branch?.id ?? "new";

  return (
    <form action={formAction} className="space-y-3">
      {branch ? <input type="hidden" name="branchId" value={branch.id} /> : null}
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}

      <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
        <Field label="Branch name" htmlFor={`branch-name-${id}`} error={state.errors?.name}>
          <Input
            id={`branch-name-${id}`}
            name="name"
            defaultValue={branch?.name ?? ""}
            required
            placeholder="Gulberg"
          />
        </Field>
        <Field label="Address" htmlFor={`branch-address-${id}`} error={state.errors?.address} hint="Optional.">
          <Input
            id={`branch-address-${id}`}
            name="address"
            defaultValue={branch?.address ?? ""}
            placeholder="12 Mall Road"
          />
        </Field>
        <div className="sm:mt-[1.625rem]">
          <SubmitButton variant={branch ? "ghost" : "primary"} size="sm" pendingLabel="Saving...">
            {branch ? "Save" : "Add branch"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
