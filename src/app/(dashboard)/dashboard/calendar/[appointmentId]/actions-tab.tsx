import { completeAndCheckOutAction } from "../actions";
import { AppointmentActions } from "../appointment-actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { AppointmentRow, ReceiptRow, TeamMemberRow } from "@/lib/types/database";

/** Appointment › Actions: finishing, billing, moving, cancelling. Front desk only. */
export async function ActionsTab({
  appointment: appt,
  roster,
  when,
  editable,
}: {
  appointment: AppointmentRow;
  roster: TeamMemberRow[];
  when: { localDate: string; localStart: string };
  editable: boolean;
}) {
  await requireSession();
  const supabase = await createClient();

  const { data: receipts } = await supabase
    .from("receipts")
    .select("*")
    .eq("appointment_id", appt.id);
  const receipt = ((receipts ?? []) as ReceiptRow[]).find((r) => r.status === "issued");

  return (
    <Card>
      <CardTitle>Actions</CardTitle>
      <p className="-mt-2 mb-4 text-small text-muted">
        Completing a visit offers the till; it does not require it. A completed visit can still be
        owed for.
      </p>
      <div className="flex flex-wrap items-start gap-2">
        {editable ? (
          <form action={completeAndCheckOutAction}>
            <input type="hidden" name="appointmentId" value={appt.id} />
            <Button type="submit">Complete &amp; take payment</Button>
          </form>
        ) : null}

        {appt.status === "completed" && !receipt ? (
          <ButtonLink href={`/dashboard/pos?appointment=${appt.id}`}>Raise the bill</ButtonLink>
        ) : null}

        <AppointmentActions
          appointmentId={appt.id}
          status={appt.status}
          staffId={appt.staff_id}
          date={when.localDate}
          time={when.localStart}
          therapists={roster.map((m) => ({ id: m.id, name: m.full_name }))}
        />
      </div>
    </Card>
  );
}
