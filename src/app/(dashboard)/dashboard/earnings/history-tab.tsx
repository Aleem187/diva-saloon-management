import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { PayrollEntryRow } from "@/lib/types/database";

/** My earnings › Payroll history: one row per pay period that covers your work. */
export async function HistoryTab() {
  const session = await requireRole("staff", "owner");
  const currency = session.salon.currency;
  const rosterId = session.teamMemberId;

  let entries: PayrollEntryRow[] = [];
  if (rosterId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("payroll_entries")
      .select("*")
      .eq("staff_id", rosterId)
      .order("period_starts_on", { ascending: false });
    entries = (data ?? []) as PayrollEntryRow[];
  }

  if (entries.length === 0) {
    return <EmptyState>No payroll periods cover your work yet.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <p className="text-small text-muted">A period stops changing once the owner marks it paid.</p>

      <Table label="Payroll history" className="min-w-[680px]">
        <TableHead>
          <TableRow>
            <TableHeader>Period</TableHeader>
            <TableHeader align="right">Services</TableHeader>
            <TableHeader align="right">Revenue</TableHeader>
            <TableHeader align="right">Salary</TableHeader>
            <TableHeader align="right">Commission</TableHeader>
            <TableHeader align="right">Total</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap">
                {formatDate(entry.period_starts_on)} – {formatDate(entry.period_ends_on)}
              </TableCell>
              <TableCell align="right">{entry.services_performed}</TableCell>
              <TableCell align="right">{formatMoney(entry.revenue, currency)}</TableCell>
              <TableCell align="right">
                {Number(entry.salary_pay) > 0 ? formatMoney(entry.salary_pay, currency) : "—"}
              </TableCell>
              <TableCell align="right">
                {Number(entry.commission_pay) > 0 ? formatMoney(entry.commission_pay, currency) : "—"}
              </TableCell>
              <TableCell align="right" className="font-semibold">
                {formatMoney(entry.commission_amount, currency)}
              </TableCell>
              <TableCell>
                <Pill tone={entry.status === "paid" ? "good" : "warning"}>
                  {entry.status === "paid" ? `Paid ${formatDate(entry.paid_at)}` : "Draft"}
                </Pill>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
