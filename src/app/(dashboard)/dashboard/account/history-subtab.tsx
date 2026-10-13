import { InvoiceHistory, type InvoiceView } from "./invoice-history";
import { requireOwner } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatLongDayLabel, instantToSalonDate } from "@/lib/time";
import type { InvoiceRow } from "@/lib/types/database";

/**
 * Stripe reports money in the currency's minor unit and the invoice columns keep
 * it that way. Dividing by 100 is right for the dollar plan this product sells
 * and would be wrong for a zero-decimal currency such as JPY -- there are none.
 */
const fromMinor = (amount: number) => amount / 100;

/** Failed is not a Stripe status: it is an open invoice Stripe has tried and failed to collect. */
function classify(invoice: InvoiceRow): Pick<InvoiceView, "group" | "statusLabel" | "tone"> {
  if (invoice.status === "paid") return { group: "paid", statusLabel: "Paid", tone: "good" };
  if (invoice.status === "uncollectible" || (invoice.status === "open" && invoice.attempt_count > 0)) {
    return { group: "failed", statusLabel: "Failed", tone: "critical" };
  }
  if (invoice.status === "open") return { group: "open", statusLabel: "Open", tone: "warning" };
  return {
    group: null,
    statusLabel: invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1),
    tone: "neutral",
  };
}

/** Billing › History: the invoices mirror, newest first. */
export async function HistorySubTab() {
  const session = await requireOwner();
  const supabase = await createClient();
  const timeZone = session.salon.timezone;

  // Owner-only by RLS; written only by the Stripe webhook.
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(24);

  const month = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone });

  const rows: InvoiceView[] = ((data ?? []) as InvoiceRow[]).map((invoice) => {
    const kind = classify(invoice);
    return {
      id: invoice.id,
      stripeId: invoice.stripe_invoice_id,
      date: formatLongDayLabel(instantToSalonDate(invoice.created_at, timeZone)),
      description: `Salon plan · ${month.format(new Date(invoice.created_at))}`,
      method: invoice.payment_method_label ?? "—",
      amount: formatMoney(
        fromMinor(invoice.status === "paid" ? invoice.amount_paid : invoice.amount_due),
        invoice.currency.toUpperCase(),
      ),
      discount: Number(invoice.discount_percent) > 0 ? `${Number(invoice.discount_percent)}%` : "—",
      ...kind,
      canPay: kind.group === "open" || kind.group === "failed",
      pdf: invoice.invoice_pdf ?? invoice.hosted_invoice_url,
    };
  });

  return <InvoiceHistory rows={rows} />;
}
