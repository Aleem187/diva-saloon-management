import "server-only";

import type Stripe from "stripe";

import { toSalonStatus } from "@/lib/billing/status";
import { getStripe } from "@/lib/billing/stripe";
import type { SessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Keeping the local mirror (subscriptions, invoices, and the billing columns on
 * salons) in step with Stripe.
 *
 * THE SERVICE-ROLE CLIENT IS USED HERE ON PURPOSE. A webhook arrives with no
 * user session, and the mirror tables have no write policy at all, so there is
 * nothing for the RLS-bound client to write as. This is the narrow exception to
 * "the admin client never touches tenant tables": every write below is scoped to
 * a salon found from a Stripe customer id, never from anything in the request.
 *
 * IDEMPOTENT BY CONSTRUCTION. Every handler takes only an object's ID from the
 * event and then RETRIEVES the object from Stripe, so what is stored is always
 * Stripe's current state -- not whatever an older event, delivered late or twice,
 * happened to say. Writes are upserts keyed on Stripe's own ids, so a replay
 * rewrites the same row with the same values.
 */

type Admin = ReturnType<typeof createAdminClient>;

const iso = (seconds: number | null | undefined): string | null =>
  typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  !value ? null : typeof value === "string" ? value : value.id;

/** "Visa •••• 4242", or null when there is nothing to describe. */
function describePaymentMethod(pm: Stripe.PaymentMethod | null | undefined): string | null {
  if (!pm) return null;
  if (pm.card) {
    const brand = pm.card.brand ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1) : "Card";
    return `${brand} •••• ${pm.card.last4}`;
  }
  return pm.type ? pm.type.replace(/_/g, " ") : null;
}

/** The customer's default card, which is what an invoice is charged to. */
async function defaultPaymentMethodLabel(
  stripe: Stripe,
  customerId: string,
  subscription?: Stripe.Subscription | null,
): Promise<string | null> {
  const fromSubscription = subscription?.default_payment_method;
  if (fromSubscription && typeof fromSubscription !== "string") {
    return describePaymentMethod(fromSubscription);
  }
  const wanted =
    idOf(fromSubscription) ??
    (await (async () => {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) return null;
      return idOf(customer.invoice_settings?.default_payment_method);
    })());
  if (!wanted) return null;
  return describePaymentMethod(await stripe.paymentMethods.retrieve(wanted));
}

/** The salon that owns a Stripe customer, or null for one we do not know. */
async function salonForCustomer(admin: Admin, customerId: string): Promise<string | null> {
  const { data } = await admin
    .from("salons")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Stripe customer for a salon, created the first time billing is needed and
 * remembered on `salons.stripe_customer_id`.
 *
 * Lazily rather than at signup: a salon that never opens Billing never costs a
 * customer, and existing salons need exactly the same path. The idempotency key
 * means two simultaneous first visits get the same customer, and the conditional
 * update means only one of them stores it.
 */
export async function ensureStripeCustomer(session: SessionContext): Promise<string> {
  const { salon } = session;
  if (salon.stripe_customer_id) return salon.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create(
    {
      name: salon.name,
      email: session.email,
      metadata: { salon_id: salon.id },
    },
    { idempotencyKey: `salon-customer-${salon.id}` },
  );

  const admin = createAdminClient();
  const { data: stored } = await admin
    .from("salons")
    .update({ stripe_customer_id: customer.id })
    .eq("id", salon.id)
    .is("stripe_customer_id", null)
    .select("id");

  if (!stored || stored.length === 0) {
    // Somebody else stored one first. Use theirs; it is the same customer.
    const { data: current } = await admin
      .from("salons")
      .select("stripe_customer_id")
      .eq("id", salon.id)
      .maybeSingle();
    if (current?.stripe_customer_id) return current.stripe_customer_id;
    throw new Error("Could not store the Stripe customer for this salon.");
  }

  return customer.id;
}

/** Mirror one subscription, and move the salon's own status with it. */
export async function syncSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  const admin = createAdminClient();

  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["default_payment_method"],
  });

  const customerId = idOf(sub.customer);
  if (!customerId) return;
  const salonId = await salonForCustomer(admin, customerId);
  if (!salonId) {
    // Not one of ours (another product on the same Stripe account). Nothing to
    // record, and a 4xx would only make Stripe retry it for days.
    console.warn("[stripe] subscription %s belongs to an unknown customer; ignored", sub.id);
    return;
  }

  // The subscription's current period now lives on its items.
  const periodEnd = sub.items.data.reduce<number | null>(
    (latest, item) => (latest === null || item.current_period_end > latest ? item.current_period_end : latest),
    null,
  );
  const label = await defaultPaymentMethodLabel(stripe, customerId, sub);

  // Every column written explicitly (CLAUDE.md rule 5).
  const { error } = await admin.from("subscriptions").upsert(
    {
      salon_id: salonId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      status: sub.status,
      current_period_end: iso(periodEnd),
      trial_end: iso(sub.trial_end),
      cancel_at_period_end: sub.cancel_at_period_end,
      payment_method_label: label,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw new Error(`subscriptions upsert: ${error.message}`);

  // The salon follows this subscription -- unless this one has ended and the
  // salon has moved on to another, in which case a late "deleted" event for the
  // old one must not undo the new one.
  const { data: salon } = await admin
    .from("salons")
    .select("stripe_subscription_id")
    .eq("id", salonId)
    .maybeSingle();
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  const pointsElsewhere = Boolean(salon?.stripe_subscription_id) && salon?.stripe_subscription_id !== sub.id;
  if (ended && pointsElsewhere) return;

  const { data: updated, error: salonError } = await admin
    .from("salons")
    .update({
      stripe_subscription_id: sub.id,
      subscription_status: toSalonStatus(sub.status),
      current_period_end: iso(periodEnd),
    })
    .eq("id", salonId)
    .select("id");
  if (salonError) throw new Error(`salons update: ${salonError.message}`);
  // A zero-row update is not an error in PostgREST (CLAUDE.md rule 7).
  if (!updated || updated.length === 0) throw new Error(`salon ${salonId} was not updated`);
}

/** Mirror one invoice, then re-sync the subscription it belongs to. */
export async function syncInvoice(invoiceId: string): Promise<void> {
  const stripe = getStripe();
  const admin = createAdminClient();

  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["default_payment_method"] });

  const customerId = idOf(invoice.customer);
  if (!customerId) return;
  const salonId = await salonForCustomer(admin, customerId);
  if (!salonId) {
    console.warn("[stripe] invoice %s belongs to an unknown customer; ignored", invoice.id);
    return;
  }

  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);

  // How much of the list price was taken off, as a percentage, worked out here
  // from Stripe's own figures rather than trusted from a coupon definition.
  const discount = (invoice.total_discount_amounts ?? []).reduce((sum, d) => sum + d.amount, 0);
  const discountPercent =
    invoice.subtotal > 0 ? Math.round((discount / invoice.subtotal) * 10000) / 100 : 0;

  const invoicePm = invoice.default_payment_method;
  const label =
    invoicePm && typeof invoicePm !== "string"
      ? describePaymentMethod(invoicePm)
      : await defaultPaymentMethodLabel(stripe, customerId);

  const { error } = await admin.from("invoices").upsert(
    {
      salon_id: salonId,
      stripe_invoice_id: invoice.id as string,
      stripe_subscription_id: subscriptionId,
      number: invoice.number,
      created_at: new Date(invoice.created * 1000).toISOString(),
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status ?? "draft",
      attempt_count: invoice.attempt_count,
      discount_percent: discountPercent,
      payment_method_label: label,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_pdf: invoice.invoice_pdf ?? null,
    },
    { onConflict: "stripe_invoice_id" },
  );
  if (error) throw new Error(`invoices upsert: ${error.message}`);

  // A paid or failed invoice is usually what changed the subscription's status.
  if (subscriptionId) await syncSubscription(subscriptionId);
}

/** A card was attached: refresh the label shown beside the subscription. */
export async function syncPaymentMethod(paymentMethodId: string): Promise<void> {
  const stripe = getStripe();
  const admin = createAdminClient();

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  const customerId = idOf(pm.customer);
  if (!customerId) return;
  if (!(await salonForCustomer(admin, customerId))) return;

  // The default is what is charged; fall back to the card just attached.
  const label = (await defaultPaymentMethodLabel(stripe, customerId)) ?? describePaymentMethod(pm);

  const { error } = await admin
    .from("subscriptions")
    .update({ payment_method_label: label })
    .eq("stripe_customer_id", customerId);
  if (error) throw new Error(`subscriptions label update: ${error.message}`);
}
