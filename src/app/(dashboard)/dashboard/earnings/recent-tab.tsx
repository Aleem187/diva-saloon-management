import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatInstantInSalon } from "@/lib/time";
import type { ReceiptLineItemRow } from "@/lib/types/database";

const RECENT_SERVICES = 50;

/** My earnings › Recent services: the latest lines of work recorded against you. */
export async function RecentTab() {
  const session = await requireRole("staff", "owner");
  const currency = session.salon.currency;
  const rosterId = session.teamMemberId;

  let services: ReceiptLineItemRow[] = [];
  if (rosterId) {
    const supabase = await createClient();
    // The receipt header is not readable by a therapist; `performed_at` lives on
    // the line itself precisely so this history stands alone.
    const { data } = await supabase
      .from("receipt_line_items")
      .select("*")
      .eq("staff_id", rosterId)
      .order("performed_at", { ascending: false })
      .limit(RECENT_SERVICES);
    services = (data ?? []) as ReceiptLineItemRow[];
  }

  if (services.length === 0) return <EmptyState>Nothing recorded against you yet.</EmptyState>;

  return (
    <div className="space-y-3">
      <p className="text-small text-muted">Your most recent {RECENT_SERVICES}.</p>

      <Table label="Recent services" className="min-w-[480px]">
        <TableHead>
          <TableRow>
            <TableHeader>When</TableHeader>
            <TableHeader>Service</TableHeader>
            <TableHeader align="right">Qty</TableHeader>
            <TableHeader align="right">Revenue</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {services.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="whitespace-nowrap text-muted">
                {formatInstantInSalon(line.performed_at, session.salon.timezone)}
              </TableCell>
              <TableCell className="font-semibold">{line.service_name}</TableCell>
              <TableCell align="right">{line.quantity}</TableCell>
              <TableCell align="right">{formatMoney(line.line_total, currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
