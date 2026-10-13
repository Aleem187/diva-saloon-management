"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createSetupIntentAction, finalizeCardAction } from "./billing-actions";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";

/*
 * Adding a card. The card number is typed into Stripe's own Payment Element, an
 * iframe served by Stripe: it goes from the browser to Stripe and never through
 * this app, so there are deliberately no card fields of ours. The publishable
 * key is the one key meant for browsers.
 */
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function Setup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!stripe || !elements) return;
    setSaving(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      // Only needed if the card's bank sends the customer away to authenticate;
      // the page then lands back here and `AddCard` finishes the job.
      confirmParams: {
        return_url: `${window.location.origin}/dashboard/account?tab=billing&sub=methods`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      // Stripe's message for the customer (declined, incomplete, ...).
      setError(result.error.message ?? "That card could not be saved.");
      setSaving(false);
      return;
    }

    const recorded = await finalizeCardAction(result.setupIntent.id);
    if (recorded.error) {
      setError(recorded.error);
      setSaving(false);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <Flash tone="error">{error}</Flash> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} loading={saving} disabled={!stripe || !elements}>
          Save card
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
      <p className="text-small text-muted">
        Card details are handled by Stripe and never stored on our servers.
      </p>
    </div>
  );
}

export function AddCard() {
  const router = useRouter();
  const params = useSearchParams();
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [appearance, setAppearance] = useState<{ colorPrimary?: string; colorText?: string; colorBackground?: string }>({});
  const container = useRef<HTMLDivElement>(null);
  const finishing = useRef(false);

  // Coming back from a redirect-based authentication: Stripe appends the
  // SetupIntent to the URL. Record the card once, then tidy the URL.
  const returned = params.get("setup_intent");
  useEffect(() => {
    if (!returned || finishing.current) return;
    finishing.current = true;
    finalizeCardAction(returned).then((result) => {
      if (result.error) setError(result.error);
      router.replace("/dashboard/account?tab=billing&sub=methods", { scroll: false });
      router.refresh();
    });
  }, [returned, router]);

  function begin() {
    setError(null);
    startTransition(async () => {
      const result = await createSetupIntentAction();
      if (result.error || !result.clientSecret) {
        setError(result.error ?? "Could not start adding a card.");
        return;
      }
      // Style Stripe's element from the page's own tokens, so it follows the
      // salon's colour scheme without a colour being written down here.
      const css = getComputedStyle(container.current ?? document.documentElement);
      setAppearance({
        colorPrimary: css.getPropertyValue("--accent").trim() || undefined,
        colorText: css.getPropertyValue("--ink").trim() || undefined,
        colorBackground: css.getPropertyValue("--surface").trim() || undefined,
      });
      setSecret(result.clientSecret);
    });
  }

  function close() {
    setSecret(null);
    router.refresh();
  }

  return (
    <div ref={container}>
      <Card className="max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="mb-0">Add a card</CardTitle>
          {!secret ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={begin}
              loading={starting}
              disabled={!stripePromise}
            >
              Add card
            </Button>
          ) : null}
        </div>

        {!stripePromise ? (
          <p className="mt-3 text-small text-muted">
            Adding a card needs <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to be set.
          </p>
        ) : null}
        {error ? (
          <div className="mt-3">
            <Flash tone="error">{error}</Flash>
          </div>
        ) : null}

        {secret && stripePromise ? (
          <div className="mt-4">
            <Elements
              stripe={stripePromise}
              options={{ clientSecret: secret, appearance: { variables: appearance } }}
            >
              <Setup onDone={close} onCancel={close} />
            </Elements>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
