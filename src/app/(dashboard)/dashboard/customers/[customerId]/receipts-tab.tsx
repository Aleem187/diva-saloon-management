import Link from "next/link";

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
import { requireSession } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ReceiptRow } from "@/lib/types/database";

/** Customer › Receipts: the most recent 20. Front desk only. */
export async function ReceiptsTab({ customerId }: { customerId: string }) {
  const session = await requireSession();
  const supabase = await createClient();
  const currency = session.salon.currency;

  const { data: receipts } = await supabase
    .from("receipts")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (receipts ?? []) as ReceiptRow[];

  if (rows.length === 0) return <EmptyState>No receipts yet.</EmptyState>;

  return (
    <div className="space-y-3">
      <Table label="Receipts, most recent 20">
        <TableHead>
          <TableRow>
            <TableHeader>Receipt</TableHeader>
            <TableHeader>Date</TableHeader>
            <TableHeader align="right">Total</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((receipt) => (
            <TableRow key={receipt.id}>
              <TableCell>
                <Link
                  href={`/dashboard/pos/${receipt.id}`}
                  className="font-semibold text-accent tabular-nums hover:underline"
                >
                  #{receipt.receipt_number}
                </Link>
              </TableCell>
              <TableCell className="text-muted">{formatDateTime(receipt.created_at)}</TableCell>
              <TableCell
                align="right"
                className={receipt.status === "voided" ? "text-muted line-through" : "font-semibold"}
              >
                {formatMoney(receipt.total, currency)}
              </TableCell>
              <TableCell>
                <Pill tone={receipt.status === "voided" ? "critical" : "good"}>
                  {receipt.status === "voided" ? "Voided" : "Issued"}
                </Pill>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-small text-muted">Most recent 20.</p>
    </div>
  );
}
