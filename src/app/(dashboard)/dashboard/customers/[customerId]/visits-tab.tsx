import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { requireSession } from "@/lib/auth/session";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatDayLabel, instantToSalonDate, instantToSalonTime } from "@/lib/time";
import type { AppointmentRow, ServiceRow } from "@/lib/types/database";

/** Customer › Visits: booking history. RLS limits a therapist to their own. */
export async function VisitsTab({ customerId }: { customerId: string }) {
  const session = await requireSession();
  const supabase = await createClient();
  const timeZone = session.salon.timezone;
  const currency = session.salon.currency;

  const [{ data: services }, { data: appointments }] = await Promise.all([
    supabase.from("services").select("*").eq("is_active", true).order("name"),
    // RLS narrows this to the caller: a therapist sees only their own visits
    // with this customer.
    supabase
      .from("appointments")
      .select("*")
      .eq("customer_id", customerId)
      .order("starts_at", { ascending: false }),
  ]);

  const serviceById = new Map<string, string>();
  for (const s of (services ?? []) as ServiceRow[]) serviceById.set(s.id, s.name);

  const visits = (appointments ?? []) as AppointmentRow[];

  return (
    <Card padding="none" className="max-w-3xl">
      <CardHeader
        title="Visits"
        description={
          session.profile.role === "staff"
            ? "Your own appointments with this customer."
            : "Booking history for this customer."
        }
      />
      {visits.length === 0 ? (
        <div className="p-5">
          <EmptyState>No appointments yet.</EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {visits.slice(0, 20).map((visit) => (
            <li key={visit.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span>
                {formatDayLabel(instantToSalonDate(visit.starts_at, timeZone))}{" "}
                <span className="tabular-nums text-muted">
                  {instantToSalonTime(visit.starts_at, timeZone)}
                </span>{" "}
                &middot; {serviceById.get(visit.service_id) ?? "Treatment"}
                {visit.is_walk_in ? <span className="ml-2 text-fine text-warning-fg">walk-in</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-small text-muted">
                  {formatMoney(visit.price_at_booking, currency)}
                </span>
                <Pill tone={STATUS_TONE[visit.status]}>{STATUS_LABEL[visit.status]}</Pill>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-5 py-3 text-small text-muted">Most recent 20.</p>
    </Card>
  );
}
