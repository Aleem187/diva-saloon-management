import { PrintButton } from "./print-button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { Pill } from "@/components/ui/pill";
import { requireModule } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type {
  CustomerRow,
  ProfileRow,
  ReceiptLineItemRow,
  ReceiptRow,
  TeamMemberRow,
} from "@/lib/types/database";

const METHOD_LABEL = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  split: "Split",
} as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Receipt › Receipt: the printable document, and a voided notice above it. */
export async function ReceiptTab({ receipt: r }: { receipt: ReceiptRow }) {
  const session = await requireModule("pos");
  const supabase = await createClient();
  const currency = session.salon.currency;

  const [{ data: lines }, { data: customer }, { data: team }, { data: roster }] = await Promise.all([
    supabase.from("receipt_line_items").select("*").eq("receipt_id", r.id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", r.customer_id).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email"),
    // Line attribution is to the roster, which is not the same set of ids as
    // the logins above.
    supabase.from("team_members").select("id, full_name"),
  ]);

  // Logins: who issued or voided the receipt.
  const nameById = new Map<string, string>();
  for (const p of (team ?? []) as Pick<ProfileRow, "id" | "full_name" | "email">[]) {
    nameById.set(p.id, p.full_name || p.email);
  }

  // The roster: who performed each line.
  const performerName = new Map<string, string>();
  for (const m of (roster ?? []) as Pick<TeamMemberRow, "id" | "full_name">[]) {
    performerName.set(m.id, m.full_name);
  }

  const person = customer as CustomerRow | null;

  return (
    <div className="space-y-4">
      {r.status === "voided" ? (
        <div className="print:hidden">
          <Flash tone="error">
            <p className="font-semibold">This receipt was voided</p>
            <p className="mt-1">
              {formatDateTime(r.voided_at)}
              {r.voided_by ? ` by ${nameById.get(r.voided_by) ?? "an owner"}` : ""} — {r.void_reason}
            </p>
            <p className="mt-1">
              The original is kept exactly as issued. The loyalty it moved has been reversed in the
              ledger.
            </p>
          </Flash>
        </div>
      ) : null}

      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>

      {/* The printable document. */}
      <Card padding="none" className="mx-auto max-w-[640px] print:border-0 print:shadow-none">
        <div className="space-y-5 p-6">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <h2 className="font-heading text-section font-semibold">{session.salon.name}</h2>
              <p className="text-fine text-muted">
                {session.salon.country} &middot; {session.salon.timezone}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">Receipt #{r.receipt_number}</p>
              <p className="text-fine text-muted">{formatDateTime(r.created_at)}</p>
              {r.status === "voided" ? (
                <p className="mt-1">
                  <Pill tone="critical">VOIDED</Pill>
                </p>
              ) : null}
            </div>
          </header>

          <div className="grid gap-3 text-small sm:grid-cols-2">
            <div>
              <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                Customer
              </p>
              <p>{person?.full_name ?? "—"}</p>
              <p className="text-fine text-muted">{person?.phone}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                Issued by
              </p>
              <p>{r.issued_by ? (nameById.get(r.issued_by) ?? "—") : "—"}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-line text-left text-fine tracking-[0.05em] text-muted uppercase">
                  <th className="py-2 font-semibold">Service</th>
                  <th className="py-2 font-semibold">Performed by</th>
                  <th className="py-2 text-right font-semibold">Qty</th>
                  <th className="py-2 text-right font-semibold">Price</th>
                  <th className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {((lines ?? []) as ReceiptLineItemRow[]).map((item) => (
                  <tr key={item.id}>
                    <td className="py-2">{item.service_name}</td>
                    <td className="py-2 text-muted">
                      {item.staff_id ? (performerName.get(item.staff_id) ?? "—") : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">{item.quantity}</td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {formatMoney(item.unit_price, currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(item.line_total, currency)}
                      {Number(item.discount_amount) > 0 ? (
                        <span className="block text-fine text-good-fg">
                          −{formatMoney(item.discount_amount, currency)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto w-full max-w-xs space-y-1.5 border-t border-line pt-3 text-small">
            <Row label="Subtotal" value={formatMoney(r.subtotal, currency)} />
            {Number(r.discount_total) > 0 ? (
              <Row label="Discount" value={`− ${formatMoney(r.discount_total, currency)}`} />
            ) : null}
            {Number(r.loyalty_redeemed) > 0 ? (
              <Row label="Loyalty redeemed" value={`− ${formatMoney(r.loyalty_redeemed, currency)}`} />
            ) : null}
            <div className="flex items-center justify-between border-t border-line pt-2 font-semibold text-ink">
              <dt>Total</dt>
              <dd className="font-heading text-section tabular-nums">{formatMoney(r.total, currency)}</dd>
            </div>
            {/*
              How the bill was settled. An advance taken before today is its
              own line, so cash + card + advance visibly adds up to the total
              rather than the printed receipt disagreeing with the money that
              crossed the counter.
            */}
            {Number(r.deposit_applied) > 0 ? (
              <Row
                label="Paid in advance"
                value={`− ${formatMoney(r.deposit_applied, currency)}`}
              />
            ) : null}
            <Row
              label={
                Number(r.deposit_applied) > 0
                  ? `Taken today (${METHOD_LABEL[r.payment_method]})`
                  : `Paid (${METHOD_LABEL[r.payment_method]})`
              }
              value={
                r.payment_method === "split"
                  ? (
                      [
                        [Number(r.cash_amount), "cash"] as const,
                        [Number(r.card_amount), "card"] as const,
                        [Number(r.transfer_amount), "transfer"] as const,
                      ]
                        .filter(([amount]) => amount > 0)
                        .map(([amount, label]) => `${formatMoney(amount, currency)} ${label}`)
                        .join(" + ") || formatMoney(0, currency)
                    )
                  : formatMoney(
                      Number(r.cash_amount) + Number(r.card_amount) + Number(r.transfer_amount),
                      currency,
                    )
              }
            />
          </dl>

          <div className="rounded-[10px] bg-head px-4 py-3 text-small">
            <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">Loyalty</p>
            <div className="mt-1 space-y-0.5">
              <p>
                Redeemed this visit:{" "}
                <span className="tabular-nums">{formatMoney(r.loyalty_redeemed, currency)}</span>
              </p>
              <p>
                Earned this visit:{" "}
                <span className="tabular-nums">{formatMoney(r.loyalty_earned, currency)}</span>{" "}
                <span className="text-fine text-muted">
                  ({(Number(r.loyalty_earn_rate) * 100).toFixed(2)}% of the amount paid)
                </span>
              </p>
              <p className="text-fine text-muted">Earned credit is available on your next visit.</p>
            </div>
          </div>

          {r.notes ? (
            <p className="text-muted">
              <span className="font-semibold">Note:</span> {r.notes}
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
