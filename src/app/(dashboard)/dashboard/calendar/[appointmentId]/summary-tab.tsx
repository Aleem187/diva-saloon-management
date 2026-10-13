import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { Pill } from "@/components/ui/pill";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatInstantInSalon, formatLongDayLabel } from "@/lib/time";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import type { AppointmentRow, CustomerRow, ProfileRow } from "@/lib/types/database";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-3 first:pt-0 last:border-b-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** Appointment › Summary: who, when, with whom, and any note or reason. */
export async function SummaryTab({
  appointment: appt,
  staffName,
  when,
}: {
  appointment: AppointmentRow;
  staffName: string;
  when: { localDate: string; localStart: string; localEnd: string };
}) {
  const session = await requireSession();
  const supabase = await createClient();
  const timeZone = session.salon.timezone;

  const [{ data: customer }, { data: logins }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", appt.customer_id).maybeSingle(),
    // Who DID things, as opposed to who performs services: the person who took
    // the booking. A login, and a different set of ids from the roster.
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const actorName = new Map<string, string>();
  for (const p of (logins ?? []) as Pick<ProfileRow, "id" | "full_name" | "email">[]) {
    actorName.set(p.id, p.full_name || p.email);
  }

  const person = customer as CustomerRow | null;

  return (
    <div className="space-y-4">
      {appt.resolution_reason ? (
        <Flash tone="error">
          {STATUS_LABEL[appt.status]}: {appt.resolution_reason}
        </Flash>
      ) : null}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        <Card>
          <CardTitle>Booking summary</CardTitle>
          <dl className="text-small">
            <Fact label="Customer">
              <Link
                href={`/dashboard/customers/${appt.customer_id}`}
                className="font-semibold text-accent hover:underline"
              >
                {person?.full_name ?? "Customer"}
              </Link>
            </Fact>
            <Fact label="Service date">
              {formatLongDayLabel(when.localDate)} · {when.localStart} – {when.localEnd}
            </Fact>
            <Fact label="Team member">{staffName}</Fact>
            <Fact label="Status">
              <Pill tone={STATUS_TONE[appt.status]}>{STATUS_LABEL[appt.status]}</Pill>
            </Fact>
            <Fact label="Booked on">{formatInstantInSalon(appt.created_at, timeZone)}</Fact>
            {appt.created_by ? (
              <Fact label="Booked by">{actorName.get(appt.created_by) ?? "a colleague"}</Fact>
            ) : null}
          </dl>
        </Card>

        <Card>
          <CardTitle>Notes</CardTitle>
          {appt.notes ? (
            <p className="whitespace-pre-wrap">{appt.notes}</p>
          ) : (
            <p className="text-muted">No notes on this booking.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
