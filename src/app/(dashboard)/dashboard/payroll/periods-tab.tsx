import Link from "next/link";

import { discardDraftAction, markPaidAction } from "./actions";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireModule } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { PayrollEntryRow, PayrollPeriodRow } from "@/lib/types/database";

/**
 * Payroll › Pay periods: one period in full, and the others to open.
 *
 * The period shown is the one in `?period=`, else the newest draft (the work
 * waiting for a decision), else the newest period.
 */
export async function PeriodsTab({ periodId }: { periodId: string }) {
  const session = await requireModule("payroll");
  const supabase = await createClient();
  const currency = session.salon.currency;

  const { data } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("starts_on", { ascending: false });
  const periods = (data ?? []) as PayrollPeriodRow[];

  if (periods.length === 0) {
    return (
      <EmptyState
        title="No payroll periods yet"
        action={
          <ButtonLink href="/dashboard/payroll?tab=generate" variant="primary" size="sm">
            Generate a pay period
          </ButtonLink>
        }
      >
        Generate one to see what each team member is owed.
      </EmptyState>
    );
  }

  const selected =
    periods.find((p) => p.id === periodId) ??
    periods.find((p) => p.status === "draft") ??
    periods[0];
  const others = periods.filter((p) => p.id !== selected.id);

  const { data: entryRows } = await supabase
    .from("payroll_entries")
    .select("*")
    .eq("period_id", selected.id)
    .order("commission_amount", { ascending: false });
  const entries = (entryRows ?? []) as PayrollEntryRow[];

  const isDraft = selected.status === "draft";

  return (
    <div className="space-y-4">
      <Card padding="none">
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {formatDate(selected.starts_on)} &ndash; {formatDate(selected.ends_on)}
              <Pill tone={isDraft ? "warning" : "good"}>{isDraft ? "Draft" : "Paid"}</Pill>
            </span>
          }
          description={
            isDraft
              ? `Draft · generated ${formatDateTime(selected.created_at)}${selected.notes ? ` · ${selected.notes}` : ""}`
              : `Marked paid ${formatDateTime(selected.paid_at)}. Historical, and no longer editable.${selected.notes ? ` ${selected.notes}` : ""}`
          }
          action={
            isDraft ? (
              <div className="flex flex-wrap items-center gap-2">
                <form action={discardDraftAction}>
                  <input type="hidden" name="periodId" value={selected.id} />
                  <SubmitButton variant="danger" size="sm" pendingLabel="Discarding...">
                    Discard draft
                  </SubmitButton>
                </form>
                <form action={markPaidAction}>
                  <input type="hidden" name="periodId" value={selected.id} />
                  <SubmitButton size="sm" pendingLabel="Saving...">
                    Mark as paid
                  </SubmitButton>
                </form>
              </div>
            ) : null
          }
        />

        {entries.length === 0 ? (
          <div className="p-5">
            <EmptyState>
              Nobody was payable in this period: no services performed, and no salaries configured.
            </EmptyState>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
          <Table label="Pay for the period" className="min-w-[680px]">
            <TableHead>
              <TableRow>
                <TableHeader>Team member</TableHeader>
                <TableHeader align="right">Services</TableHeader>
                <TableHeader align="right">Revenue</TableHeader>
                <TableHeader align="right">Salary</TableHeader>
                <TableHeader align="right">Commission</TableHeader>
                <TableHeader align="right">Total</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-semibold">{entry.staff_name}</TableCell>
                  <TableCell align="right">{entry.services_performed}</TableCell>
                  <TableCell align="right">{formatMoney(entry.revenue, currency)}</TableCell>
                  {/* Salary and commission are separate arrangements, so a
                      hybrid shows both rather than one winning. */}
                  <TableCell align="right">
                    {Number(entry.salary_pay) > 0 ? (
                      <>
                        {formatMoney(entry.salary_pay, currency)}
                        <span className="block text-fine font-normal text-muted">
                          {formatMoney(entry.salary_amount, currency)}/month · {entry.salary_days_paid}{" "}
                          day{entry.salary_days_paid === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {Number(entry.commission_pay) > 0 ? (
                      <>
                        {formatMoney(entry.commission_pay, currency)}
                        <span className="block text-fine font-normal text-muted">
                          {entry.commission_basis === "percentage"
                            ? `${(Number(entry.commission_rate) * 100).toFixed(2)}%`
                            : entry.commission_basis === "fixed_per_service"
                              ? `${formatMoney(entry.fixed_amount, currency)}/service`
                              : "service rates"}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell align="right" className="font-semibold">
                    {formatMoney(entry.commission_amount, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFoot>
              <TableRow className="bg-head">
                <TableCell>Total</TableCell>
                <TableCell align="right">
                  {entries.reduce((n, e) => n + e.services_performed, 0)}
                </TableCell>
                <TableCell align="right">{formatMoney(selected.total_revenue, currency)}</TableCell>
                <TableCell align="right">
                  {formatMoney(entries.reduce((n, e) => n + Number(e.salary_pay), 0), currency)}
                </TableCell>
                <TableCell align="right">
                  {formatMoney(entries.reduce((n, e) => n + Number(e.commission_pay), 0), currency)}
                </TableCell>
                <TableCell align="right">
                  {formatMoney(selected.total_commission, currency)}
                </TableCell>
              </TableRow>
            </TableFoot>
          </Table>
          </div>
        )}
      </Card>

      {others.length > 0 ? (
        <Card padding="none">
          <CardHeader title="Previous periods" description="Open one to see what each person was paid." />
          <ul className="divide-y divide-line-soft">
            {others.map((period) => (
              <li key={period.id}>
                <Link
                  href={`/dashboard/payroll?tab=periods&period=${period.id}`}
                  scroll={false}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="font-semibold">
                    {formatDate(period.starts_on)} &ndash; {formatDate(period.ends_on)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{formatMoney(period.total_commission, currency)}</span>
                    <Pill tone={period.status === "paid" ? "good" : "warning"}>
                      {period.status === "paid" ? "Paid" : "Draft"}
                    </Pill>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
