import type { SalonRow, SubscriptionStatus } from "@/lib/types/database";

/*
 * Billing rules that both the server layout and the Billings tab need.
 *
 * Not "use client", not "server-only": pure functions and one env check (the
 * secret itself is never read here), so any server module can import it.
 */

/**
 * Is billing switched on for this deployment?
 *
 * It is when a Stripe secret key and a price are configured. Without them there
 * is nothing to subscribe to, so nothing is locked: an unconfigured install
 * (local development, a fresh clone) behaves as it did before billing existed.
 */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim());
}

/**
 * May this salon use the dashboard?
 *
 *   active                          yes
 *   trialing, with a Stripe plan    yes: Stripe moves it on when the trial ends
 *   trialing, no Stripe plan        yes until `trial_ends_at` -- the 14 days from
 *                                   signup the sidebar counts down
 *   anything else                   no: past_due, unpaid, canceled, incomplete
 *
 * `past_due` locks at once, as asked. Stripe retries a failed card for some
 * days; a grace period would be a one-line change here.
 */
export function subscriptionAllowsAccess(
  salon: Pick<SalonRow, "subscription_status" | "trial_ends_at" | "stripe_subscription_id">,
  now: Date = new Date(),
): boolean {
  switch (salon.subscription_status) {
    case "active":
      return true;
    case "trialing":
      return Boolean(salon.stripe_subscription_id) || new Date(salon.trial_ends_at) > now;
    default:
      return false;
  }
}

/** Stripe's subscription status, narrowed to the app's enum on `salons`. */
export function toSalonStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "incomplete":
    case "unpaid":
      return stripeStatus;
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "unpaid";
    default:
      // A status Stripe adds later is treated as not paying, never as access.
      return "incomplete";
  }
}
