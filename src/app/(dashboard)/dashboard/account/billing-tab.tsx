import { Suspense } from "react";

import { DiscountsSubTab } from "./discounts-subtab";
import { HistorySubTab } from "./history-subtab";
import { MethodsSubTab } from "./methods-subtab";
import { openBillingPortalAction, startSubscriptionAction } from "./billing-actions";
import { STATUS_LABEL, STATUS_TONE } from "@/components/shell-sidebar-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { SubTabs } from "@/components/ui/page-tabs";
import { Pill } from "@/components/ui/pill";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireOwner } from "@/lib/auth/session";
import { billingConfigured } from "@/lib/billing/status";
import { getStripe, stripePriceId } from "@/lib/billing/stripe";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";
import { formatLongDayLabel, instantToSalonDate } from "@/lib/time";
import type { SubscriptionRow } from "@/lib/types/database";

const SUBS: TabDefinition[] = [
  { id: "history", label: "Billing history" },
  { id: "methods", label: "Payment methods" },
  { id: "discounts", label: "Discounts" },
];

/** Stripe's money is in the currency's minor unit; see history-subtab.tsx. */
const fromMinor = (amount: number) => amount / 100;

/** The two figures the top cards need from Stripe. Either may be unavailable. */
async function loadStripeFigures(
  customerId: string | null,
  subscriptionId: string | null,
  wantsNextCharge: boolean,
) {
  const out = { credit: null as number | null, next: null as number | null, price: null as number | null, currency: "usd" };
  if (!billingConfigured()) return out;
  const stripe = getStripe();

  const [customer, price, preview] = await Promise.allSettled([
    customerId ? stripe.customers.retrieve(customerId) : Promise.resolve(null),
    stripe.prices.retrieve(stripePriceId()),
    customerId && subscriptionId && wantsNextCharge
      ? stripe.invoices.createPreview({ customer: customerId, subscription: subscriptionId })
      : Promise.resolve(null),
  ]);

  // A negative customer balance is credit the customer holds with us.
  if (customer.status === "fulfilled" && customer.value && !customer.value.deleted) {
    out.credit = Math.max(0, -customer.value.balance);
  } else if (!customerId) {
    out.credit = 0;
  }
  if (price.status === "fulfilled") {
    out.price = price.value.unit_amount;
    out.currency = price.value.currency;
  }
  if (preview.status === "fulfilled" && preview.value) {
    out.next = preview.value.amount_due;
    out.currency = preview.value.currency;
  }
  return out;
}

/** Account › Billings. Owner only: this is the salon's money. */
export async function BillingTab({ sub }: { sub?: string | string[] }) {
  const session = await requireOwner();
  const { salon } = session;
  const supabase = await createClient();
  const timeZone = salon.timezone;
  const status = salon.subscription_status;

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  const subscription = ((subscriptions ?? []) as SubscriptionRow[])[0];

  const live = Boolean(salon.stripe_subscription_id) && status !== "canceled";
  const charging = live && !subscription?.cancel_at_period_end && status !== "unpaid";

  const figures = await loadStripeFigures(
    salon.stripe_customer_id,
    salon.stripe_subscription_id,
    charging,
  );
  const money = (minor: number) => formatMoney(fromMinor(minor), figures.currency.toUpperCase());

  const day = (iso: string | null | undefined) =>
    iso ? formatLongDayLabel(instantToSalonDate(iso, timeZone)) : "—";

  const { tabs, active } = resolveTabs(session, SUBS, sub);

  return (
    <div className="space-y-4">
      {!billingConfigured() ? (
        <Flash tone="info">
          Billing is not set up on this server yet — the Stripe keys are missing. Nothing is
          locked, and there is nothing to subscribe to until they are added.
        </Flash>
      ) : null}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        {/* The plan: dark, like the sidebar, so it reads as "the account". */}
        <div className="flex flex-col gap-1.5 rounded-2xl bg-side p-5 text-on-accent">
          <div className="flex items-center justify-between gap-2">
            <span className="text-small text-side-muted">Salon plan</span>
            <span className="flex items-center gap-1.5">
              <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
              {subscription?.cancel_at_period_end ? <Pill tone="warning">Cancels</Pill> : null}
            </span>
          </div>
          <span className="font-heading text-[2.143em] leading-tight font-bold">
            {figures.price !== null ? money(figures.price) : "$20.00"}
            <span className="text-section font-medium text-side-muted"> / month</span>
          </span>
          <span className="text-small text-side-ink">
            {live && subscription ? (
              subscription.cancel_at_period_end ? (
                <>Ends on {day(subscription.current_period_end)}</>
              ) : (
                <>
                  Next charge{figures.next !== null ? ` ${money(figures.next)}` : ""} on{" "}
                  {day(subscription.current_period_end)}
                  {subscription.payment_method_label ? ` · ${subscription.payment_method_label}` : ""}
                </>
              )
            ) : status === "trialing" ? (
              <>Free trial ends {day(salon.trial_ends_at)}</>
            ) : (
              <>No active subscription.</>
            )}
          </span>

          <form action={live ? openBillingPortalAction : startSubscriptionAction} className="mt-2">
            <Button type="submit" variant="ghost" size="sm" disabled={!billingConfigured()}>
              {live ? "Manage billing" : "Start subscription"}
            </Button>
          </form>
        </div>

        {/* Read-only: Stripe applies this credit to invoices by itself. */}
        <Card className="flex flex-col gap-2.5">
          <span className="text-small text-muted">Your balance</span>
          <span className="font-heading text-[2.143em] leading-tight font-bold text-good-fg">
            {figures.credit !== null ? money(figures.credit) : "—"}
          </span>
          <span className="text-small text-muted">
            Credit on your account. It is used first for monthly charges, then your default card.
          </span>
        </Card>
      </div>

      {active ? (
        <>
          <SubTabs
            tabs={tabs}
            active={active}
            basePath="/dashboard/account"
            params={{ tab: "billing" }}
            label="Billing sections"
          />
          <TabPanel id={active} param="sub">
            <Suspense key={active} fallback={<TabFallback kpis={0} bodyHeight={240} />}>
              {active === "history" ? <HistorySubTab /> : null}
              {active === "methods" ? <MethodsSubTab hasLiveSubscription={live} /> : null}
              {active === "discounts" ? <DiscountsSubTab hasLiveSubscription={live} /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </div>
  );
}
