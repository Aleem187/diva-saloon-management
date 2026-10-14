import { describeArrangement } from "@/lib/pay-arrangement";
import { Card, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { requireRole } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addDays, endOfMonth, salonTimeToInstant, salonToday, startOfMonth } from "@/lib/time";
import type { PayrollEntryRow, StaffCompensationRow } from "@/lib/types/database";

/** PostgREST returns at most this many rows per request, silently. */
const PAGE = 1000;

/**
 * Every row of a query, a page at a time. A bare select stops at the server's
 * row cap without saying so, which for a count would be a quietly wrong number.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await page(from, from + PAGE - 1);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Money summed in whole cents, so ten 0.10s add up to 1.00 and not 0.9999999999999999. */
const sumMoney = (values: Iterable<number | string>): number => {
  let cents = 0;
  for (const v of values) cents += Math.round(Number(v) * 100);
  return cents / 100;
};

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

  const [{ data: compensation }, { data: entries }, monthLines, voidedIds] = rosterId
    ? await Promise.all([
        supabase.from("staff_compensation").select("*").eq("staff_id", rosterId).maybeSingle(),
        supabase
          .from("payroll_entries")
          .select("*")
          .eq("staff_id", rosterId)
          .order("period_starts_on", { ascending: false }),
        fetchAll<{ receipt_id: string; quantity: number }>((from, to) =>
          supabase
            .from("receipt_line_items")
            .select("receipt_id, quantity")
            .eq("staff_id", rosterId)
            .gte("performed_at", monthStartsAt)
            .lt("performed_at", monthEndsAt)
            .order("performed_at")
            .range(from, to),
        ),
        /*
         * A therapist cannot read the receipt header, so cannot tell which of
         * their lines belong to a voided sale. Someone who can take payment can,
         * and payroll leaves voided sales out, so for them the count does too. A
         * line is stamped with its receipt's own time, so the month's voided
         * receipts are found by the same range.
         */
        session.modules.has("pos")
          ? fetchAll<{ id: string }>((from, to) =>
              supabase
                .from("receipts")
                .select("id")
                .eq("status", "voided")
                .gte("created_at", monthStartsAt)
                .lt("created_at", monthEndsAt)
                .order("created_at")
                .range(from, to),
            ).then((rows) => new Set(rows.map((r) => r.id)))
          : Promise.resolve(null),
      ])
    : [{ data: null }, { data: [] }, [], null];

  const payrollEntries = (entries ?? []) as PayrollEntryRow[];
  const drafts = payrollEntries.filter((e) => e.status === "draft");

  // Sums of amounts the server already computed and stored per period.
  const paidToDate = sumMoney(
    payrollEntries.filter((e) => e.status === "paid").map((e) => e.commission_amount),
  );
  const pending = sumMoney(drafts.map((e) => e.commission_amount));

  // A count of services, in the unit payroll uses (the quantity on each line).
  const servicesThisMonth = monthLines
    .filter((line) => !voidedIds?.has(line.receipt_id))
    .reduce((sum, line) => sum + Number(line.quantity), 0);

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
          hint={
            voidedIds
              ? "Voided sales are not counted"
              : "Sales that are later voided are counted until payroll runs"
          }
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
