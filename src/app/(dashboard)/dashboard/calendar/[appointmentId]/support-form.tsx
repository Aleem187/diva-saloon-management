"use client";

import { useActionState } from "react";

import { updateSupportAction, type BookingFormState } from "../actions";
import { SupportSelects } from "../support-select";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit-button";

/** Change the support / assistant staff of an appointment (the lead is changed by rescheduling). */
export function SupportForm({
  appointmentId,
  leadId,
  people,
  currentIds,
}: {
  appointmentId: string;
  leadId: string;
  people: { id: string; name: string }[];
  currentIds: string[];
}) {
  const [state, formAction] = useActionState<BookingFormState, FormData>(updateSupportAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}
      <SupportSelects
        idPrefix={`team-${appointmentId}`}
        people={people}
        leadId={leadId}
        defaultIds={currentIds}
        error={state.errors?.supportStaffIds}
      />
      <SubmitButton size="sm" pendingLabel="Saving...">
        Save team
      </SubmitButton>
    </form>
  );
}
