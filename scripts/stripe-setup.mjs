/**
 * Create the Stripe Product "Salon plan" and its $20 / month recurring Price,
 * and print the environment lines to paste into .env.local.
 *
 *   npm run stripe:setup
 *
 * Reads STRIPE_SECRET_KEY from .env.local (or the environment). Refuses to run
 * against a live key unless you pass --live. Safe to run twice: it looks the
 * price up by its lookup key before creating anything, so it never makes a
 * duplicate. Nothing is written to the database and no key is printed.
 */
import Stripe from "stripe";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (a sk_test_ key) in .env.local first.");
  process.exit(1);
}
if (!key.startsWith("sk_test_") && !process.argv.includes("--live")) {
  console.error("That is not a test-mode key. Pass --live if you really mean to create live objects.");
  process.exit(1);
}

const PRICE_LOOKUP_KEY = "salon_plan_monthly";
const stripe = new Stripe(key, { appInfo: { name: "Salon Suite setup" } });

const existing = await stripe.prices.list({
  lookup_keys: [PRICE_LOOKUP_KEY],
  active: true,
  limit: 1,
  expand: ["data.product"],
});

let price = existing.data[0];

if (price) {
  console.log("Found the existing Salon plan price; nothing created.\n");
} else {
  const product = await stripe.products.create({
    name: "Salon plan",
    description: "Salon Suite: flat monthly subscription, per salon.",
    metadata: { app: "salon-suite" },
  });
  price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 2000,
    recurring: { interval: "month" },
    lookup_key: PRICE_LOOKUP_KEY,
    nickname: "Salon plan, monthly",
  });
  console.log("Created the Salon plan product and its $20 / month price.\n");
}

const productId = typeof price.product === "string" ? price.product : price.product.id;

console.log("Add these to .env.local:\n");
console.log(`STRIPE_PRODUCT_ID=${productId}`);
console.log(`STRIPE_PRICE_ID=${price.id}`);
console.log("\nSTRIPE_SECRET_KEY is already set. STRIPE_WEBHOOK_SECRET comes from `stripe listen`.");
