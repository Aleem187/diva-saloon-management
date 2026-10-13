"use client";

import { useActionState } from "react";

import { voidReceiptAction, type PosFormState } from "../actions";
import { Flash } from "@/components/ui/flash";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function VoidReceiptForm({ receiptId }: { receiptId: string }) {
  const [state, formAction] = useActionState<PosFormState, FormData>(voidReceiptAction, {});

  if (state.success) return <Flash tone="success">{state.success}</Flash>;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="receiptId" value={receiptId} />

      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <TextField
        label="Reason"
        id="void-reason"
        name="reason"
        required
        minLength={3}
        placeholder="Charged to the wrong customer"
        hint="Required, and kept on the audit log."
        error={state.errors?.reason}
      />

      <SubmitButton variant="danger" pendingLabel="Voiding...">
        Void receipt
      </SubmitButton>
    </form>
  );
}
