import "server-only";

import type Stripe from "stripe";

import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import type { SessionContext } from "@/lib/auth/session";
import { getStripe } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";

/*
 * The salon's saved cards, held by Stripe. Everything here runs on the server,
 * for the OWNER (callers have already passed requireOwner()), and every
 * operation that takes a payment-method id first checks that the card belongs to
 * THIS salon's Stripe customer -- an id in a form is only a claim.
 *
 * Card numbers never reach this app: they are typed into Stripe's Payment
 * Element and go straight to Stripe. All we ever see, and all we ever log, is
 * the brand and the last four digits.
 */

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

/** Stripe's own subscription statuses in which a subscription still needs a card. */
const NEEDS_A_CARD = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  !value ? null : typeof value === "string" ? value : value.id;

export class BillingError extends Error {}

function customerOf(session: SessionContext): string {
  const id = session.salon.stripe_customer_id;
  if (!id) throw new BillingError("This salon has no billing account yet.");
  return id;
}

/** The subscription Stripe will charge, if there is a live one. */
async function liveSubscription(
  stripe: Stripe,
  session: SessionContext,
): Promise<Stripe.Subscription | null> {
  const id = session.salon.stripe_subscription_id;
  if (!id) return null;
  const sub = await stripe.subscriptions.retrieve(id);
  return NEEDS_A_CARD.has(sub.status) ? sub : null;
}

/** What is charged: the subscription's own card if it has one, else the customer's. */
async function defaultCardId(
  stripe: Stripe,
  customerId: string,
  subscription: Stripe.Subscription | null,
): Promise<string | null> {
  const fromSubscription = idOf(subscription?.default_payment_method);
  if (fromSubscription) return fromSubscription;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return idOf(customer.invoice_settings?.default_payment_method);
}

/** Read the card off a payment method, refusing one that is not this salon's. */
async function ownedCard(
  stripe: Stripe,
  session: SessionContext,
  paymentMethodId: string,
): Promise<Stripe.PaymentMethod> {
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (idOf(pm.customer) !== customerOf(session)) {
    throw new BillingError("That card does not belong to this salon.");
  }
  return pm;
}

const cardLabel = (pm: Stripe.PaymentMethod) =>
  pm.card ? `${pm.card.brand} •••• ${pm.card.last4}` : pm.type;

/** The salon's cards, with the one that will be charged marked. */
export async function listCards(session: SessionContext): Promise<SavedCard[]> {
  const customerId = session.salon.stripe_customer_id;
  if (!customerId) return [];

  const stripe = getStripe();
  const [methods, subscription] = await Promise.all([
    stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 20 }),
    liveSubscription(stripe, session),
  ]);
  const defaultId = await defaultCardId(stripe, customerId, subscription);

  return methods.data
    .filter((pm) => pm.card)
    .map((pm) => ({
      id: pm.id,
      brand: pm.card!.brand,
      last4: pm.card!.last4,
      expMonth: pm.card!.exp_month,
      expYear: pm.card!.exp_year,
      isDefault: pm.id === defaultId,
    }));
}

/**
 * Make a card the one that is charged: the customer's default, and the live
 * subscription's own, so the two cannot disagree.
 */
export async function makeDefaultCard(session: SessionContext, paymentMethodId: string) {
  const stripe = getStripe();
  const customerId = customerOf(session);
  const pm = await ownedCard(stripe, session, paymentMethodId);

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });

  const subscription = await liveSubscription(stripe, session);
  if (subscription) {
    await stripe.subscriptions.update(subscription.id, { default_payment_method: pm.id });
    await syncSubscription(subscription.id);
  }

  await logAudit(session, {
    action: AUDIT_ACTIONS.BILLING_DEFAULT_CARD_CHANGED,
    entityType: "salon",
    entityId: session.salon.id,
    metadata: { card: cardLabel(pm) },
  });
}

/**
 * Remove a card. Refused for the default card while a subscription needs one:
 * detaching it would leave the next invoice with nothing to charge.
 */
export async function removeCard(session: SessionContext, paymentMethodId: string) {
  const stripe = getStripe();
  const customerId = customerOf(session);
  const pm = await ownedCard(stripe, session, paymentMethodId);

  const subscription = await liveSubscription(stripe, session);
  const defaultId = await defaultCardId(stripe, customerId, subscription);
  if (subscription && defaultId === pm.id) {
    throw new BillingError(
      "That is the card your subscription is charged to. Make another card the default first.",
    );
  }

  await stripe.paymentMethods.detach(pm.id);

  await logAudit(session, {
    action: AUDIT_ACTIONS.BILLING_CARD_REMOVED,
    entityType: "salon",
    entityId: session.salon.id,
    metadata: { card: cardLabel(pm) },
  });
}

/** A SetupIntent for Stripe's Payment Element: saves a card without charging it. */
export async function createSetupIntent(
  session: SessionContext,
  customerId: string,
): Promise<string> {
  const intent = await getStripe().setupIntents.create({
    customer: customerId,
    allowed_payment_method_types: ["card"],
    usage: "off_session",
    metadata: { salon_id: session.salon.id },
  });
  if (!intent.client_secret) throw new BillingError("Stripe did not return a setup secret.");
  return intent.client_secret;
}

/**
 * After the Payment Element succeeds: confirm with Stripe that the card really
 * was saved to THIS salon's customer, record it, and if the salon had no default
 * card, make this one the default so there is always something to charge.
 * Safe to call twice (a redirect return and the in-page path can both arrive).
 */
export async function finalizeSetupIntent(session: SessionContext, setupIntentId: string) {
  const stripe = getStripe();
  const customerId = customerOf(session);

  const intent = await stripe.setupIntents.retrieve(setupIntentId);
  if (idOf(intent.customer) !== customerId) {
    throw new BillingError("That card setup does not belong to this salon.");
  }
  if (intent.status !== "succeeded") {
    throw new BillingError("The card could not be saved.");
  }
  const pmId = idOf(intent.payment_method);
  if (!pmId) throw new BillingError("The card could not be saved.");

  const pm = await ownedCard(stripe, session, pmId);

  const subscription = await liveSubscription(stripe, session);
  const current = await defaultCardId(stripe, customerId, subscription);

  if (!current) {
    // First card: it is the default. makeDefaultCard writes its own entry.
    await makeDefaultCard(session, pm.id);
  } else if (current !== pm.id) {
    await logAudit(session, {
      action: AUDIT_ACTIONS.BILLING_CARD_ADDED,
      entityType: "salon",
      entityId: session.salon.id,
      metadata: { card: cardLabel(pm) },
    });
  }
}
