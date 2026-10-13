import "server-only";

import Stripe from "stripe";

import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import type { SessionContext } from "@/lib/auth/session";
import { BillingError } from "@/lib/billing/methods";
import { getStripe } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";
import { formatMoney } from "@/lib/format";
import { formatLongDayLabel, instantToSalonDate } from "@/lib/time";

/*
 * Discounts on a salon's Stripe customer and subscription.
 *
 * Stripe is the whole source: nothing about a discount is stored here. Runs on
 * the server for the OWNER (callers have passed requireOwner()), and everything
 * is looked up from the salon's own customer and subscription ids -- never from
 * an id in a request.
 */

export interface DiscountCard {
  key: string;
  title: string;
  /** "20% off" or "$5.00 off". */
  off: string;
  lines: { label: string; value: string }[];
  status: "Active" | "Expired";
  note?: string;
}

type CouponLike = Stripe.Coupon | null;

const couponOf = (discount: Stripe.Discount | Stripe.DeletedDiscount): CouponLike => {
  const coupon = discount.source?.coupon;
  return coupon && typeof coupon === "object" ? coupon : null;
};

const promoOf = (discount: Stripe.Discount | Stripe.DeletedDiscount): Stripe.PromotionCode | null => {
  const promo = discount.promotion_code;
  return promo && typeof promo === "object" ? promo : null;
};

/** One discount, whether still running or not, as the same kind of card. */
function toCard(
  discount: Stripe.Discount | Stripe.DeletedDiscount,
  scope: string,
  status: DiscountCard["status"],
  timeZone: string,
  note?: string,
): DiscountCard {
  const coupon = couponOf(discount);
  const promo = promoOf(discount);
  const day = (seconds: number) => formatLongDayLabel(instantToSalonDate(new Date(seconds * 1000), timeZone));

  const off = coupon?.percent_off
    ? `${coupon.percent_off}% off`
    : coupon?.amount_off
      ? `${formatMoney(coupon.amount_off / 100, (coupon.currency ?? "usd").toUpperCase())} off`
      : "Discount";

  const duration =
    coupon?.duration === "forever"
      ? "Every month"
      : coupon?.duration === "repeating"
        ? `${coupon.duration_in_months ?? "?"} months`
        : coupon?.duration === "once"
          ? "First invoice only"
          : "—";

  const lines = [
    ...(promo ? [{ label: "Code", value: promo.code }] : []),
    { label: "Duration", value: duration },
    { label: "Applies to", value: scope },
    // A deleted discount (one that already ended) carries no end date.
    {
      label: status === "Active" ? "Ends" : "Ended",
      value: "end" in discount && discount.end ? day(discount.end) : "—",
    },
  ];

  return {
    key: `${coupon?.id ?? discount.id}:${promo?.id ?? ""}`,
    title: coupon?.name ?? promo?.code ?? "Discount",
    off,
    lines,
    status,
    note,
  };
}

/**
 * Discounts on the customer and the subscription, running ones first, then ones
 * seen on past invoices that are no longer applied (those are the "Expired" ones:
 * Stripe drops a discount from the subscription once it ends, so past invoices
 * are the only place it is still visible).
 */
export async function loadDiscountCards(session: SessionContext): Promise<DiscountCard[]> {
  const { salon } = session;
  const customerId = salon.stripe_customer_id;
  if (!customerId) return [];

  const stripe = getStripe();
  const timeZone = salon.timezone;

  const [customer, subscription, invoices] = await Promise.all([
    stripe.customers.retrieve(customerId, {
      expand: ["discount.source.coupon", "discount.promotion_code"],
    }),
    salon.stripe_subscription_id
      ? stripe.subscriptions.retrieve(salon.stripe_subscription_id, {
          expand: ["discounts.source.coupon", "discounts.promotion_code"],
        })
      : Promise.resolve(null),
    stripe.invoices.list({
      customer: customerId,
      limit: 24,
      expand: ["data.discounts.source.coupon", "data.discounts.promotion_code"],
    }),
  ]);

  const now = Date.now() / 1000;
  const running = new Map<string, DiscountCard>();

  const add = (discount: Stripe.Discount, scope: string) => {
    const ended = discount.end !== null && discount.end <= now;
    const card = toCard(discount, scope, ended ? "Expired" : "Active", timeZone);
    if (!running.has(card.key)) running.set(card.key, card);
  };

  for (const d of subscription?.discounts ?? []) {
    if (typeof d !== "string") add(d, "Subscription");
  }
  if (!customer.deleted && customer.discount) add(customer.discount, "Account");

  const seen = new Set(running.keys());
  const past: DiscountCard[] = [];
  for (const invoice of invoices.data) {
    for (const d of invoice.discounts ?? []) {
      if (typeof d === "string") continue;
      const card = toCard(
        d,
        "Subscription",
        "Expired",
        timeZone,
        `Last applied to your ${formatLongDayLabel(instantToSalonDate(new Date(invoice.created * 1000), timeZone))} invoice.`,
      );
      if (seen.has(card.key)) continue;
      seen.add(card.key);
      past.push(card);
    }
  }

  return [...running.values(), ...past];
}

/** Look a code up the way a customer types it: as given, then upper-cased. */
async function findPromotionCode(stripe: Stripe, code: string) {
  for (const attempt of code === code.toUpperCase() ? [code] : [code, code.toUpperCase()]) {
    const found = await stripe.promotionCodes.list({
      code: attempt,
      limit: 1,
      expand: ["data.promotion.coupon"],
    });
    if (found.data[0]) return found.data[0];
  }
  return null;
}

/**
 * Apply a promotion code to the salon's subscription. Every refusal is a
 * BillingError with wording for the owner; anything else is a fault and is left
 * to the caller to report generically.
 */
export async function applyPromoCode(
  session: SessionContext,
  rawCode: string,
): Promise<{ title: string }> {
  const { salon } = session;
  const code = rawCode.trim();
  if (!code) throw new BillingError("Enter a promo code.");
  if (code.length > 64) throw new BillingError("That promo code is not valid.");

  const customerId = salon.stripe_customer_id;
  const subscriptionId = salon.stripe_subscription_id;
  if (!customerId || !subscriptionId || salon.subscription_status === "canceled") {
    throw new BillingError(
      "Start your subscription first. You can also enter the code at checkout.",
    );
  }

  const stripe = getStripe();
  const promo = await findPromotionCode(stripe, code);
  if (!promo) throw new BillingError("That promo code is not valid.");

  if (!promo.active || (promo.expires_at !== null && promo.expires_at * 1000 < Date.now())) {
    throw new BillingError("That promo code has expired or is no longer active.");
  }
  if (promo.max_redemptions !== null && promo.times_redeemed >= promo.max_redemptions) {
    throw new BillingError("That promo code has already been used the maximum number of times.");
  }
  const coupon = promo.promotion.coupon && typeof promo.promotion.coupon === "object"
    ? promo.promotion.coupon
    : null;
  if (coupon && !coupon.valid) throw new BillingError("That promotion has ended.");

  const restrictedTo = promo.customer && (typeof promo.customer === "string" ? promo.customer : promo.customer.id);
  if (restrictedTo && restrictedTo !== customerId) {
    throw new BillingError("That promo code is not valid for this account.");
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["discounts.promotion_code"],
  });

  const existing: { discount: string }[] = [];
  for (const d of subscription.discounts) {
    if (typeof d === "string") {
      existing.push({ discount: d });
      continue;
    }
    const applied = d.promotion_code && typeof d.promotion_code === "object" ? d.promotion_code.id : null;
    if (applied === promo.id) throw new BillingError("That promo code is already applied.");
    existing.push({ discount: d.id });
  }

  try {
    await stripe.subscriptions.update(subscription.id, {
      // Keep what is already there, and add this one.
      discounts: [...existing, { promotion_code: promo.id }],
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      // Typically a restriction on the code (first purchase only, a minimum).
      throw new BillingError("That promo code cannot be applied to this subscription.");
    }
    throw error;
  }

  await syncSubscription(subscription.id);

  const title = coupon?.name ?? promo.code;
  await logAudit(session, {
    action: AUDIT_ACTIONS.BILLING_PROMO_CODE_APPLIED,
    entityType: "salon",
    entityId: salon.id,
    metadata: { code: promo.code, promotion: title },
  });

  return { title };
}
