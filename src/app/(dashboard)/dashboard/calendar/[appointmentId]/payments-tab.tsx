import Link from "next/link";

import { RecordPaymentForm, RefundPaymentForm } from "./payment-form";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat-tile";
import { requireSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatInstantInSalon, salonToday } from "@/lib/time";
import type {
  AppointmentRow,
  PaymentKind,
  PaymentRow,
  ProfileRow,
  ReceiptRow,
} from "@/lib/types/database";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

const KIND_LABEL: Record<PaymentKind, string> = {
  deposit: "Advance",
  settlement: "At checkout",
  refund: "Refund",
};

/** Appointment › Payments: owed, paid, the ledger, and taking or refunding money. */
export async function PaymentsTab({
  appointment: appt,
  isOwner,
  payable,
  money,
}: {
  appointment: AppointmentRow;
  isOwner: boolean;
  payable: boolean;
  money: { due: number; paid: number; outstanding: number };
}) {
  const session = await requireSession();
  const supabase = await createClient();
  const timeZone = session.salon.timezone;
  const currency = session.salon.currency;
  const { due, paid, outstanding } = money;

  const [{ data: receipts }, { data: payments }, { data: logins }] = await Promise.all([
    supabase.from("receipts").select("*").eq("appointment_id", appt.id),
    // The ledger is front-desk only by policy; a therapist simply gets nothing.
    supabase.from("payments").select("*").eq("appointment_id", appt.id).order("paid_at"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const actorName = new Map<string, string>();
  for (const p of (logins ?? []) as Pick<ProfileRow, "id" | "full_name" | "email">[]) {
    actorName.set(p.id, p.full_name || p.email);
  }

  const paymentRows = (payments ?? []) as PaymentRow[];
  const receipt = ((receipts ?? []) as ReceiptRow[]).find((r) => r.status === "issued");
  const voidedReceipts = ((receipts ?? []) as ReceiptRow[]).filter((r) => r.status === "voided");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <StatTile label={receipt ? "Billed" : "Agreed price"} value={formatMoney(due, currency)} />
        <StatTile label="Paid so far" value={formatMoney(paid, currency)} />
        <StatTile
          label={outstanding < 0 ? "Owed back" : "Outstanding"}
          value={formatMoney(Math.abs(outstanding), currency)}
          tone={outstanding > 0.005 ? "critical" : "default"}
        />
      </div>

      <Card padding="none">
        <CardHeader
          title="Payment history"
          description={
            receipt
              ? "The receipt is what is owed; the ledger below is what was actually received."
              : "No receipt yet. Anything taken now is an advance against the agreed price."
          }
        />

        {receipt ? (
          <p className="border-b border-line px-5 py-3 text-small text-muted">
            Billed on receipt{" "}
            <Link href={`/dashboard/pos/${receipt.id}`} className="font-semibold text-accent hover:underline">
              #{receipt.receipt_number}
            </Link>{" "}
            for {formatMoney(receipt.total, currency)}.
          </p>
        ) : null}

        {voidedReceipts.length > 0 ? (
          <p className="border-b border-line px-5 py-3 text-fine text-muted">
            {voidedReceipts.length} voided receipt{voidedReceipts.length === 1 ? "" : "s"} on this
            visit:{" "}
            {voidedReceipts.map((r, i) => (
              <span key={r.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/dashboard/pos/${r.id}`} className="text-accent hover:underline">
                  #{r.receipt_number}
                </Link>
              </span>
            ))}
          </p>
        ) : null}

        {paymentRows.length === 0 ? (
          <p className="px-5 py-6 text-center text-muted">Nothing paid yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {paymentRows.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
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
                      {KIND_LABEL[payment.kind]}
                    </Pill>
                    <span className="text-fine text-muted">
                      {METHOD_LABEL[payment.method] ?? payment.method}
                    </span>
                  </p>
                  <p className="mt-0.5 text-fine text-muted">
                    {formatInstantInSalon(payment.paid_at, timeZone)}
                    {payment.recorded_by
                      ? ` · ${actorName.get(payment.recorded_by) ?? "a colleague"}`
                      : ""}
                  </p>
                  {payment.note ? <p className="mt-1 text-fine text-muted">{payment.note}</p> : null}
                </div>

                {isOwner && payment.kind !== "refund" ? (
                  <RefundPaymentForm
                    paymentId={payment.id}
                    appointmentId={appt.id}
                    amount={Number(payment.amount)}
                    currency={currency}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {payable && outstanding > 0.005 ? (
        <Card padding="none">
          <CardHeader title="Take a payment" />
          <div className="p-5">
            <RecordPaymentForm
              appointmentId={appt.id}
              outstanding={outstanding}
              currency={currency}
              today={salonToday(timeZone)}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
