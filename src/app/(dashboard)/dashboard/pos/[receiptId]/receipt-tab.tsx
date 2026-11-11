import { PrintButton } from "./print-button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { Pill } from "@/components/ui/pill";
import { requireModule } from "@/lib/auth/session";
import { formatMoney as formatAmount } from "@/lib/format";
import { formatStampInSalon } from "@/lib/time";
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
  const timeZone = session.salon.timezone;
  // The printed receipt names its currency (PKR 1,250.00) rather than using a symbol.
  const money = (amount: number | string, code: string) => formatAmount(amount, code, "code");

  const [{ data: lines }, { data: customer }, { data: team }, { data: roster }, { data: support }] =
    await Promise.all([
    supabase.from("receipt_line_items").select("*").eq("receipt_id", r.id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", r.customer_id).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email"),
    // Line attribution is to the roster, which is not the same set of ids as
    // the logins above.
    supabase.from("team_members").select("id, full_name"),
    // Support / assistants on the visit this receipt settles (none for a walk-in sale).
    r.appointment_id
      ? supabase
          .from("appointment_staff")
          .select("staff_id, sort_order")
          .eq("appointment_id", r.appointment_id)
          .order("sort_order")
      : Promise.resolve({ data: [] as { staff_id: string }[] }),
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

  // Group the lines by what they are; a kind with no lines gets no section at all.
  const items = (lines ?? []) as ReceiptLineItemRow[];
  const sections = (["service", "product"] as const)
    .map((kind) => ({ kind, items: items.filter((item) => (item.item_type ?? "service") === kind) }))
    .filter((section) => section.items.length > 0);

  // Support / assistants who helped the lead on this visit.
  const supportNames = ((support ?? []) as { staff_id: string }[]).map(
    (row) => performerName.get(row.staff_id) ?? "A colleague",
  );

  const person = customer as CustomerRow | null;

  return (
    <div className="space-y-4">
      {r.status === "voided" ? (
        <div className="print:hidden">
          <Flash tone="error">
            <p className="font-semibold">This receipt was voided</p>
            <p className="mt-1">
              {r.voided_at ? formatStampInSalon(r.voided_at, timeZone) : "—"}
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
                {session.salon.country}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">Receipt #{r.receipt_number}</p>
              <p className="text-fine text-muted">{formatStampInSalon(r.created_at, timeZone)}</p>
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

          {supportNames.length > 0 ? (
            <p className="text-small">
              <span className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                Team{" "}
              </span>
              Support / assistants: {supportNames.join(", ")}
            </p>
          ) : null}

          {/*
            Services and products are listed under their own headings when the
            sale has both, and a sale with only one shows just that table, with no
            heading and no empty section for the other.
          */}
          {sections.map((section) => (
            <div key={section.kind} className="overflow-x-auto">
              {sections.length > 1 ? (
                <h3 className="mb-1 text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                  {section.kind === "service" ? "Services" : "Products"}
                </h3>
              ) : null}
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-line text-left text-fine tracking-[0.05em] text-muted uppercase">
                    <th className="py-2 font-semibold">
                      {section.kind === "service" ? "Service" : "Product"}
                    </th>
                    {section.kind === "service" ? (
                      <th className="py-2 font-semibold">Performed by</th>
                    ) : null}
                    <th className="py-2 text-right font-semibold">Qty</th>
                    <th className="py-2 text-right font-semibold">Price</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {section.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2">{item.service_name}</td>
                      {section.kind === "service" ? (
                        <td className="py-2 text-muted">
                          {item.staff_id ? (performerName.get(item.staff_id) ?? "—") : "—"}
                        </td>
                      ) : null}
                      <td className="py-2 text-right tabular-nums text-muted">{item.quantity}</td>
                      <td className="py-2 text-right tabular-nums text-muted">
                        {money(item.unit_price, currency)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(item.line_total, currency)}
                        {Number(item.discount_amount) > 0 ? (
                          <span className="block text-fine text-good-fg">
                            −{money(item.discount_amount, currency)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {sections.length > 1 ? (
                  <tfoot>
                    <tr className="border-t border-line text-muted">
                      <td
                        className="py-1.5 font-semibold"
                        colSpan={section.kind === "service" ? 4 : 3}
                      >
                        {section.kind === "service" ? "Services" : "Products"} subtotal
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {money(
                          section.items.reduce((sum, item) => sum + Number(item.line_total), 0),
                          currency,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ))}

          <dl className="ml-auto w-full max-w-xs space-y-1.5 border-t border-line pt-3 text-small">
            <Row label="Subtotal" value={money(r.subtotal, currency)} />
            {Number(r.discount_total) > 0 ? (
              <Row label="Discount" value={`− ${money(r.discount_total, currency)}`} />
            ) : null}
            {/*
              A discretionary discount is already inside the figure above; this
              says what part of it was given at the till. The reason is for the
              salon, not the customer, so it is left off the printed copy.
            */}
            {Number(r.manual_discount_amount) > 0 ? (
              <p className="text-fine text-muted">
                Includes{" "}
                {r.manual_discount_type === "percentage"
                  ? `a ${Number(r.manual_discount_value)}% discount`
                  : "a fixed discount"}{" "}
                ({`− ${money(r.manual_discount_amount, currency)}`})
                <span className="print:hidden"> · {r.manual_discount_reason}</span>
              </p>
            ) : null}
            {Number(r.loyalty_redeemed) > 0 ? (
              <Row label="Loyalty redeemed" value={`− ${money(r.loyalty_redeemed, currency)}`} />
            ) : null}
            <div className="flex items-center justify-between border-t border-line pt-2 font-semibold text-ink">
              <dt>Total</dt>
              <dd className="font-heading text-section tabular-nums">{money(r.total, currency)}</dd>
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
                value={`− ${money(r.deposit_applied, currency)}`}
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
                        .map(([amount, label]) => `${money(amount, currency)} ${label}`)
                        .join(" + ") || money(0, currency)
                    )
                  : money(
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
                <span className="tabular-nums">{money(r.loyalty_redeemed, currency)}</span>
              </p>
              <p>
                Earned this visit:{" "}
                <span className="tabular-nums">{money(r.loyalty_earned, currency)}</span>{" "}
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
