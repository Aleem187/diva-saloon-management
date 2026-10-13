import { describeArrangement } from "@/lib/pay-arrangement";
import { Card, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { requireRole } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addDays, endOfMonth, salonTimeToInstant, salonToday, startOfMonth } from "@/lib/time";
import type { PayrollEntryRow, StaffCompensationRow } from "@/lib/types/database";

/** My earnings › Summary: what has been paid, what is pending, and how you are paid. */
export async function SummaryTab() {
  const session = await requireRole("staff", "owner");
  const supabase = await createClient();
  const currency = session.salon.currency;
  const timeZone = session.salon.timezone;

  // Everything keys on the ROSTER entry, not the login. A login with no roster
  // entry performs no services, so the queries are skipped rather than risk
  // returning someone else's rows.
  const rosterId = session.teamMemberId;

  const today = salonToday(timeZone);
  const monthStartsAt = salonTimeToInstant(startOfMonth(today), "00:00", timeZone).toISOString();
  const monthEndsAt = salonTimeToInstant(addDays(endOfMonth(today), 1), "00:00", timeZone).toISOString();

  const [{ data: compensation }, { data: entries }, { data: monthLines }] = rosterId
    ? await Promise.all([
        supabase.from("staff_compensation").select("*").eq("staff_id", rosterId).maybeSingle(),
        supabase
          .from("payroll_entries")
          .select("*")
          .eq("staff_id", rosterId)
          .order("period_starts_on", { ascending: false }),
        supabase
          .from("receipt_line_items")
          .select("quantity")
          .eq("staff_id", rosterId)
          .gte("performed_at", monthStartsAt)
          .lt("performed_at", monthEndsAt),
      ])
    : [{ data: null }, { data: [] }, { data: [] }];

  const payrollEntries = (entries ?? []) as PayrollEntryRow[];
  const drafts = payrollEntries.filter((e) => e.status === "draft");

  // Sums of amounts the server already computed and stored per period.
  const paidToDate = payrollEntries
    .filter((e) => e.status === "paid")
    .reduce((sum, e) => sum + Number(e.commission_amount), 0);
  const pending = drafts.reduce((sum, e) => sum + Number(e.commission_amount), 0);

  // A count of services, in the unit payroll uses (the quantity on each line).
  const servicesThisMonth = ((monthLines ?? []) as { quantity: number }[]).reduce(
    (sum, line) => sum + Number(line.quantity),
    0,
  );

  const arrangement = describeArrangement(
    (compensation as StaffCompensationRow | null) ?? null,
    currency,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <StatTile
          label="Paid to date"
          value={formatMoney(paidToDate, currency)}
          hint="Periods the owner has marked paid"
        />
        <StatTile
          label="Pending (current draft)"
          value={formatMoney(pending, currency)}
          hint={
            drafts.length === 1
              ? `${formatDate(drafts[0].period_starts_on)} – ${formatDate(drafts[0].period_ends_on)}, not yet paid`
              : drafts.length > 1
                ? `${drafts.length} draft periods, not yet paid`
                : "No draft period right now"
          }
        />
        <StatTile
          label="Services this month"
          value={String(servicesThisMonth)}
          hint="Sales that are later voided are counted until payroll runs"
        />
      </div>

      <Card>
        <CardTitle>Your pay arrangement</CardTitle>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-small">
          <dt className="text-muted">Type</dt>
          <dd className="font-semibold text-ink">{arrangement.type}</dd>
          <dt className="text-muted">Monthly salary</dt>
          <dd className="text-ink">{arrangement.salary}</dd>
          <dt className="text-muted">Commission</dt>
          <dd className="text-ink">{arrangement.commission}</dd>
        </dl>
        <p className="mt-3 text-fine text-muted">
          Questions about your pay? Ask the salon owner. Only they can change your arrangement.
        </p>
      </Card>
    </div>
  );
}
