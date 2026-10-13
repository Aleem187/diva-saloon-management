import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripe, stripeWebhookSecret } from "@/lib/billing/stripe";
import { syncInvoice, syncPaymentMethod, syncSubscription } from "@/lib/billing/sync";

// Stripe posts here, signed. Never cached, always the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook.
 *
 * Authentication is the signature, not a session: the proxy lets this path
 * through, and anything that does not verify against STRIPE_WEBHOOK_SECRET is
 * refused before a byte of it is read. The raw body is used exactly as it
 * arrived -- verification is over those bytes, so it must not be parsed first.
 *
 * Responses: 400 for a bad or missing signature, 200 once handled (or ignored:
 * an event type we do not use), 500 when handling failed, which makes Stripe
 * retry it. Handlers are idempotent -- see `@/lib/billing/sync`.
 *
 * Nothing from the payload is logged: invoices carry customer details.
 */
export async function POST(request: NextRequest) {
  let secret: string;
  try {
    secret = stripeWebhookSecret();
  } catch {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object.id);
        break;

      case "invoice.created":
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_failed": {
        const id = event.data.object.id;
        if (id) await syncInvoice(id);
        break;
      }

      case "payment_method.attached":
        await syncPaymentMethod(event.data.object.id);
        break;

      default:
        // Not one we act on. Acknowledge so Stripe stops sending it.
        break;
    }
  } catch (error) {
    console.error("[stripe] could not handle %s (%s):", event.type, event.id, error);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
