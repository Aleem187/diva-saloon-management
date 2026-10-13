import { AddCard } from "./add-card";
import { makeDefaultCardAction, removeCardAction } from "./billing-actions";
import { Button } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Pill } from "@/components/ui/pill";
import { requireOwner } from "@/lib/auth/session";
import { listCards, type SavedCard } from "@/lib/billing/methods";
import { billingConfigured } from "@/lib/billing/status";
import { cn } from "@/components/ui/cn";

const BRAND_SHORT: Record<string, string> = {
  visa: "VISA",
  mastercard: "MC",
  amex: "AMEX",
  discover: "DISC",
};

/** Billing › Payment methods: the cards Stripe holds for this salon. */
export async function MethodsSubTab({ hasLiveSubscription }: { hasLiveSubscription: boolean }) {
  const session = await requireOwner();

  let cards: SavedCard[] = [];
  let failed = false;
  if (billingConfigured()) {
    try {
      cards = await listCards(session);
    } catch (error) {
      console.error("[billing] could not list cards:", error);
      failed = true;
    }
  }

  return (
    <div className="space-y-4">
      {failed ? (
        <Flash tone="error">Could not load your cards from Stripe. Please refresh in a moment.</Flash>
      ) : null}

      {cards.length === 0 && !failed ? (
        <p className="text-muted">
          No cards on file yet. Add one below, or when you start your subscription.
        </p>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {cards.map((card) => {
            // The default card cannot be removed while a subscription is
            // charged to it. The server refuses too; this just says why.
            const lockedDefault = card.isDefault && hasLiveSubscription;
            return (
              <div
                key={card.id}
                className={cn(
                  "flex flex-col gap-3 rounded-[14px] border bg-surface p-[18px]",
                  card.isDefault
                    ? "border-accent shadow-[inset_0_0_0_1px_var(--accent)]"
                    : "border-line",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid h-[34px] w-[52px] place-items-center rounded-md bg-side text-fine font-bold tracking-[0.04em] text-on-accent"
                    >
                      {BRAND_SHORT[card.brand] ?? card.brand.slice(0, 4).toUpperCase()}
                    </span>
                    <div>
                      <strong className="capitalize">
                        {card.brand} •••• {card.last4}
                      </strong>
                      <p className="text-small text-muted">
                        Expires {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
                      </p>
                    </div>
                  </div>
                  {card.isDefault ? <Pill tone="accent">Default</Pill> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!card.isDefault ? (
                    <form action={makeDefaultCardAction}>
                      <input type="hidden" name="paymentMethodId" value={card.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Make default
                      </Button>
                    </form>
                  ) : null}
                  {lockedDefault ? (
                    <span className="text-small text-muted">
                      Charged to your subscription. Make another card the default to remove it.
                    </span>
                  ) : (
                    <form action={removeCardAction}>
                      <input type="hidden" name="paymentMethodId" value={card.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Remove
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddCard />
    </div>
  );
}
