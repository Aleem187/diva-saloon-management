import Link from "next/link";

import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { requireModule } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { PaymentRow, ReceiptRow } from "@/lib/types/database";

const PAYMENT_KIND_LABEL = {
  deposit: "Advance",
  settlement: "At checkout",
  refund: "Refund",
} as const;

/** Receipt › Payment history: the money itself, outside the printable document. */
export async function HistoryTab({ receipt: r }: { receipt: ReceiptRow }) {
  const session = await requireModule("pos");
  const supabase = await createClient();
  const currency = session.salon.currency;

  // Every payment against the VISIT, not just this receipt, so an advance
  // taken days earlier appears on the document that accounts for it.
  const { data: payments } = r.appointment_id
    ? await supabase
        .from("payments")
        .select("*")
        .eq("appointment_id", r.appointment_id)
        .order("paid_at")
    : await supabase.from("payments").select("*").eq("receipt_id", r.id).order("paid_at");

  const rows = (payments ?? []) as PaymentRow[];

  return (
    <Card padding="none" className="max-w-3xl">
      <CardHeader
        title="Payments received"
        description={
          r.appointment_id
            ? "Everything paid towards this visit, including advances taken before the bill was raised."
            : "What was taken for this sale."
        }
      />
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState>No payments are recorded against this receipt.</EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((payment) => (
            <li key={payment.id} className="px-5 py-3">
              <p className="flex items-center gap-2">
                <span
                  className={
                    Number(payment.amount) < 0
                      ? "font-semibold tabular-nums text-critical-fg"
                      : "font-semibold tabular-nums"
                  }
                >
                  {formatMoney(payment.amount, currency)}
                </span>
                <Pill tone={payment.kind === "refund" ? "critical" : "neutral"}>
                  {PAYMENT_KIND_LABEL[payment.kind]}
                </Pill>
              </p>
              <p className="mt-0.5 text-fine text-muted">
                {formatDateTime(payment.paid_at)}
                {payment.note ? ` · ${payment.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      {r.appointment_id ? (
        <div className="border-t border-line px-5 py-3">
          <Link
            href={`/dashboard/calendar/${r.appointment_id}`}
            className="text-small font-semibold text-accent hover:underline"
          >
            Open the appointment this settles
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
