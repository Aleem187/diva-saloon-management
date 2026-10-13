import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

/** The Stripe client. Keys come from the environment only; nothing is hard-coded. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing environment variable STRIPE_SECRET_KEY.");
  client ??= new Stripe(key, { appInfo: { name: "Salon Suite" } });
  return client;
}

/** The recurring Price for the "Salon plan" ($20 / month). */
export function stripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID?.trim();
  if (!id) throw new Error("Missing environment variable STRIPE_PRICE_ID.");
  return id;
}

export function stripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Missing environment variable STRIPE_WEBHOOK_SECRET.");
  return secret;
}
