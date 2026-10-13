import { StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { LoyaltyTransactionRow } from "@/lib/types/database";

const LEDGER_LABEL: Record<LoyaltyTransactionRow["type"], string> = {
  earn: "Earned",
  redeem: "Redeemed",
  void_reversal: "Adjusted (receipt voided)",
};

/** Customer › Loyalty: the balance and the ledger behind it. Front desk only. */
export async function LoyaltyTab({ customerId, balance }: { customerId: string; balance: number }) {
  const session = await requireSession();
  const supabase = await createClient();
  const currency = session.salon.currency;

  const { data: ledger } = await supabase
    .from("loyalty_transactions")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(20);

  const entries = (ledger ?? []) as LoyaltyTransactionRow[];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <StatTile
          label="Balance"
          value={formatMoney(balance, currency)}
          tone="good"
          hint="Held as a currency balance, not a point count. Earned credit is spendable from the next visit."
        />
      </div>

      {entries.length === 0 ? (
        <EmptyState>No loyalty activity yet.</EmptyState>
      ) : (
        <Table label="Loyalty ledger, most recent 20">
          <TableHead>
            <TableRow>
              <TableHeader>Date</TableHeader>
              <TableHeader>Entry</TableHeader>
              <TableHeader align="right">Change</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted">{formatDateTime(entry.created_at)}</TableCell>
                <TableCell>{LEDGER_LABEL[entry.type]}</TableCell>
                <TableCell
                  align="right"
                  className={Number(entry.amount) >= 0 ? "text-good-fg" : "text-critical-fg"}
                >
                  {Number(entry.amount) >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(Number(entry.amount)), currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-small text-muted">
        Every movement above is a ledger entry; the balance is their sum. Showing the most recent 20.
      </p>
    </div>
  );
}
