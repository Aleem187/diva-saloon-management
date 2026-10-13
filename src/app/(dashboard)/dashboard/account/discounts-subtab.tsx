import { applyPromoCodeAction } from "./billing-actions";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { TextField } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireOwner } from "@/lib/auth/session";
import { loadDiscountCards, type DiscountCard } from "@/lib/billing/discounts";
import { billingConfigured } from "@/lib/billing/status";

/** Billing › Discounts: what is taken off, from Stripe, and a way to add a promo code. */
export async function DiscountsSubTab({ hasLiveSubscription }: { hasLiveSubscription: boolean }) {
  const session = await requireOwner();

  let cards: DiscountCard[] = [];
  let failed = false;
  if (billingConfigured()) {
    try {
      cards = await loadDiscountCards(session);
    } catch (error) {
      console.error("[billing] could not load discounts:", error);
      failed = true;
    }
  }

  return (
    <div className="space-y-4">
      {failed ? (
        <Flash tone="error">Could not load your discounts from Stripe. Please refresh in a moment.</Flash>
      ) : null}

      {cards.length === 0 && !failed ? (
        <p className="text-muted">
          No discounts on your account. If you have a promo code, enter it below.
        </p>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {cards.map((card) => (
            <div
              key={card.key}
              className={cn(
                "flex flex-col gap-2.5 rounded-xl border border-l-4 border-line bg-surface p-[18px]",
                card.status === "Active" ? "border-l-accent" : "border-l-field",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <strong>{card.title}</strong>
                <span
                  className={cn(
                    "font-heading text-kpi font-semibold",
                    card.status === "Active" ? "text-good-fg" : "text-muted",
                  )}
                >
                  {card.off}
                </span>
              </div>
              {card.lines.map((line) => (
                <div key={line.label} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{line.label}</span>
                  <span>{line.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Status</span>
                <Pill tone={card.status === "Active" ? "good" : "neutral"}>{card.status}</Pill>
              </div>
              {card.note ? <span className="text-small text-muted">{card.note}</span> : null}
            </div>
          ))}
        </div>
      )}

      <Card className="max-w-xl">
        <CardTitle>Have a promo code?</CardTitle>
        <p className="-mt-2 mb-3 text-small text-muted">
          Codes apply to your subscription&rsquo;s next invoice.
        </p>
        <form action={applyPromoCodeAction} className="flex flex-wrap items-end gap-3">
          <TextField
            label="Promo code"
            id="promo-code"
            name="code"
            placeholder="e.g. WELCOME10"
            autoComplete="off"
            maxLength={64}
            className="min-w-52 flex-1"
            disabled={!hasLiveSubscription}
          />
          <SubmitButton pendingLabel="Applying..." disabled={!hasLiveSubscription}>
            Apply
          </SubmitButton>
        </form>
        {!hasLiveSubscription ? (
          <p className="mt-2 text-small text-muted">
            Start your subscription first. You can also enter a code at checkout.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
