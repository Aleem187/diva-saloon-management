"use server";

import { redirect } from "next/navigation";
import Stripe from "stripe";

import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { requireOwner } from "@/lib/auth/session";
import { applyPromoCode } from "@/lib/billing/discounts";
import {
  BillingError,
  createSetupIntent,
  finalizeSetupIntent,
  makeDefaultCard,
  removeCard,
} from "@/lib/billing/methods";
import { billingConfigured } from "@/lib/billing/status";
import { getStripe, stripePriceId } from "@/lib/billing/stripe";
import { ensureStripeCustomer, syncInvoice } from "@/lib/billing/sync";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { redirectWithFlash } from "@/lib/flash";

/*
 * The two ways out to Stripe: Checkout to start a subscription, and the
 * customer portal to manage one. Both are the OWNER's (requireOwner), both
 * return to the Billings tab, and neither trusts anything from the request: the
 * salon, the customer and the price all come from the session and from the
 * environment.
 *
 * `redirect()` works by throwing, so it is never called inside a try block.
 */

const BACK = "/dashboard/account";
const BILLING = { tab: "billing" } as const;

/** Stripe will not start a Checkout trial that ends in under 48 hours. */
const MIN_TRIAL_MS = 48 * 60 * 60 * 1000 + 5 * 60 * 1000;

export async function startSubscriptionAction(): Promise<void> {
  const session = await requireOwner();
  const { salon } = session;

  if (!billingConfigured()) {
    await redirectWithFlash(BACK, "error", "Billing is not set up on this server yet.", BILLING);
  }

  // One subscription per salon. Anything not ended is managed, not duplicated.
  if (salon.stripe_subscription_id && salon.subscription_status !== "canceled") {
    await redirectWithFlash(
      BACK,
      "info",
      "This salon already has a subscription. Use Manage billing to change it.",
      BILLING,
    );
  }

  let checkoutUrl: string | null = null;
  try {
    const customerId = await ensureStripeCustomer(session);

    /*
     * Carry what is left of the 14-day trial into Stripe, so subscribing early
     * does not forfeit it and the first charge lands on the day the countdown
     * hits zero. Under 48 hours left, Stripe will not accept a trial, and the
     * first charge is today.
     */
    const trialEndsAt = new Date(salon.trial_ends_at).getTime();
    const trialEnd =
      salon.subscription_status === "trialing" && trialEndsAt - Date.now() > MIN_TRIAL_MS
        ? Math.floor(trialEndsAt / 1000)
        : undefined;

    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: salon.id,
      line_items: [{ price: stripePriceId(), quantity: 1 }],
      subscription_data: {
        metadata: { salon_id: salon.id },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      allow_promotion_codes: true,
      success_url: `${siteUrl()}${BACK}?tab=billing&checkout=success`,
      cancel_url: `${siteUrl()}${BACK}?tab=billing&checkout=cancelled`,
    });
    checkoutUrl = checkout.url;
  } catch (error) {
    console.error("[billing] could not start Checkout:", error);
  }

  if (!checkoutUrl) {
    await redirectWithFlash(
      BACK,
      "error",
      "Could not start checkout. Please try again in a moment.",
      BILLING,
    );
  }

  await logAudit(session, {
    action: AUDIT_ACTIONS.BILLING_CHECKOUT_STARTED,
    entityType: "salon",
    entityId: salon.id,
    metadata: {},
  });

  redirect(checkoutUrl as string);
}

export async function openBillingPortalAction(): Promise<void> {
  const session = await requireOwner();
  const { salon } = session;

  if (!billingConfigured()) {
    await redirectWithFlash(BACK, "error", "Billing is not set up on this server yet.", BILLING);
  }

  let portalUrl: string | null = null;
  try {
    const customerId = await ensureStripeCustomer(session);
    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl()}${BACK}?tab=billing`,
    });
    portalUrl = portal.url;
  } catch (error) {
    console.error("[billing] could not open the portal:", error);
  }

  if (!portalUrl) {
    await redirectWithFlash(
      BACK,
      "error",
      "Could not open the billing portal. Please try again in a moment.",
      BILLING,
    );
  }

  await logAudit(session, {
    action: AUDIT_ACTIONS.BILLING_PORTAL_OPENED,
    entityType: "salon",
    entityId: salon.id,
    metadata: {},
  });

  redirect(portalUrl as string);
}

/* -------------------------------------------------------------------------- */
/* Cards and invoices                                                          */
/* -------------------------------------------------------------------------- */

const METHODS = { tab: "billing", sub: "methods" } as const;
const HISTORY = { tab: "billing", sub: "history" } as const;
const DISCOUNTS = { tab: "billing", sub: "discounts" } as const;

/** What to tell the owner: our own refusals as written, anything else generically. */
const messageFor = (error: unknown, fallback: string) =>
  error instanceof BillingError ? error.message : fallback;

/** Pay an open or failed invoice with the card on file. */
export async function payInvoiceAction(formData: FormData): Promise<void> {
  await requireOwner();
  const stripeInvoiceId = String(formData.get("invoiceId") ?? "");

  // The invoice must be this salon's: the owner can read only their own rows,
  // so an id from anywhere else finds nothing.
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("stripe_invoice_id, hosted_invoice_url")
    .eq("stripe_invoice_id", stripeInvoiceId)
    .maybeSingle();

  if (!invoice) {
    await redirectWithFlash(BACK, "error", "That invoice could not be found.", HISTORY);
    return;
  }

  let message: { tone: "success" | "error"; text: string } = {
    tone: "success",
    text: "Payment received. Thank you.",
  };

  try {
    const paid = await getStripe().invoices.pay(invoice.stripe_invoice_id);
    if (paid.status !== "paid") {
      message = {
        tone: "error",
        text: "The payment is still processing. This page updates when Stripe confirms it.",
      };
    }
  } catch (error) {
    // A declined card carries a message written for the customer; anything else
    // (a card that needs authentication, a network fault) is sent to the
    // invoice page, which can handle both.
    const stripeMessage = error instanceof Stripe.errors.StripeCardError ? error.message : null;
    console.error("[billing] could not pay invoice %s:", stripeInvoiceId, error);
    message = {
      tone: "error",
      text: stripeMessage
        ? `${stripeMessage} Update your card in Payment methods, or open the invoice to pay it there.`
        : "The payment could not be completed. Open the invoice to pay it on Stripe's page.",
    };
  }

  // Do not wait for the webhook: show the invoice as it now stands.
  try {
    await syncInvoice(invoice.stripe_invoice_id);
  } catch (error) {
    console.error("[billing] could not refresh invoice %s:", stripeInvoiceId, error);
  }

  await redirectWithFlash(BACK, message.tone, message.text, HISTORY);
}

export async function makeDefaultCardAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  let flash: { tone: "success" | "error"; text: string } = {
    tone: "success",
    text: "Default card updated.",
  };
  try {
    await makeDefaultCard(session, String(formData.get("paymentMethodId") ?? ""));
  } catch (error) {
    console.error("[billing] could not change the default card:", error);
    flash = { tone: "error", text: messageFor(error, "Could not change the default card.") };
  }
  await redirectWithFlash(BACK, flash.tone, flash.text, METHODS);
}

export async function removeCardAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  let flash: { tone: "success" | "error"; text: string } = { tone: "success", text: "Card removed." };
  try {
    await removeCard(session, String(formData.get("paymentMethodId") ?? ""));
  } catch (error) {
    console.error("[billing] could not remove a card:", error);
    flash = { tone: "error", text: messageFor(error, "Could not remove that card.") };
  }
  await redirectWithFlash(BACK, flash.tone, flash.text, METHODS);
}

/**
 * Start saving a card: a SetupIntent whose client secret goes to the browser,
 * where Stripe's Payment Element collects the card. Returns data rather than
 * redirecting, because the form it feeds is already on screen.
 */
export async function createSetupIntentAction(): Promise<{ clientSecret?: string; error?: string }> {
  const session = await requireOwner();
  if (!billingConfigured()) return { error: "Billing is not set up on this server yet." };
  try {
    // The customer is created on first need, so the id comes back from here
    // rather than from the session, which may predate it.
    const customerId = await ensureStripeCustomer(session);
    return { clientSecret: await createSetupIntent(session, customerId) };
  } catch (error) {
    console.error("[billing] could not start a card setup:", error);
    return { error: messageFor(error, "Could not start adding a card. Please try again.") };
  }
}

/** After the Payment Element succeeds (or Stripe redirects back): record the card. */
export async function finalizeCardAction(setupIntentId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  try {
    await finalizeSetupIntent(session, setupIntentId);
    return {};
  } catch (error) {
    console.error("[billing] could not finalise a new card:", error);
    return { error: messageFor(error, "The card was saved, but could not be recorded here.") };
  }
}

/** Apply a promotion code to the subscription. Invalid and expired codes say so. */
export async function applyPromoCodeAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  let flash: { tone: "success" | "error"; text: string };
  try {
    const { title } = await applyPromoCode(session, String(formData.get("code") ?? ""));
    flash = { tone: "success", text: `Promo code applied: ${title}. It will show on your next invoice.` };
  } catch (error) {
    if (!(error instanceof BillingError)) console.error("[billing] could not apply a promo code:", error);
    flash = { tone: "error", text: messageFor(error, "Could not apply that code. Please try again.") };
  }
  await redirectWithFlash(BACK, flash.tone, flash.text, DISCOUNTS);
}
