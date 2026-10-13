# Billing (Stripe)

A flat **$20 / month per salon**, after the 14-day trial every salon starts with. Stripe is the source of truth; `subscriptions` and `invoices` are a local mirror kept current by the webhook.

## How it fits together

| Piece | Where |
| --- | --- |
| Customer | Created lazily, the first time the owner opens Checkout or the portal: `ensureStripeCustomer()` in `src/lib/billing/sync.ts`. Stored on `salons.stripe_customer_id`. Idempotent. |
| Checkout | `startSubscriptionAction` (`account/billing-actions.ts`). Owner only. Carries the rest of the local trial into Stripe (`trial_end`) so nothing is charged until the countdown ends; under 48 hours left, Stripe will not accept a trial and the first charge is immediate. |
| Portal | `openBillingPortalAction`. Card changes, invoices, cancel. |
| Cards and invoices (Phase 5b) | `src/lib/billing/methods.ts` and the actions in `account/billing-actions.ts`: list, make default, remove, add (Stripe Payment Element via a SetupIntent), pay an invoice. Every id from a form is checked against this salon's Stripe customer first. |
| Webhook | `POST /api/stripe/webhook`. Verifies the signature, then for each event fetches the object from Stripe and upserts it, so replays and out-of-order delivery cannot corrupt state. |
| Mirror | `subscriptions`, `invoices` (migration `20260924000039_stripe_billing.sql`). Owner can read; only the service role writes. `salons.subscription_status`, `stripe_subscription_id`, `current_period_end` follow the subscription. |
| Gate | `src/app/(dashboard)/layout.tsx`, using `subscriptionAllowsAccess()` in `src/lib/billing/status.ts`. |

### The gate

Applies **only when `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are both set**. Without them nothing is locked and the Billings tab says so.

| Salon state | Dashboard |
| --- | --- |
| `active` | open |
| `trialing` with a Stripe plan | open (Stripe moves it on) |
| `trialing`, no Stripe plan, `trial_ends_at` in the future | open |
| `trialing`, no Stripe plan, `trial_ends_at` passed | **locked** |
| `past_due`, `unpaid`, `canceled`, `incomplete` | **locked** |

Locked: the **owner** is redirected to `/dashboard/account?tab=billing&reason=inactive` (the Account page and `/auth/signout` stay reachable); **everyone else** sees "Subscription inactive — contact the owner" with a Sign out button. `past_due` locks immediately; a grace period is a one-line change in `subscriptionAllowsAccess()`.

## Setup (test mode)

1. **Migrations.** Review, then `npm run db:push`: `20260924000038_salon_appearance.sql`, `20260924000039_stripe_billing.sql`, `20260924000040_invoice_attempt_count.sql`.
2. **Keys.** In the Stripe Dashboard, switch to **Test mode** and copy the secret key into `.env.local` as `STRIPE_SECRET_KEY=sk_test_...`, and the publishable key as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` (the only key meant for browsers; "Add card" needs it). Never commit either (`.env*` is git-ignored; `.env.example` has placeholders only).
3. **Product and price.** `npm run stripe:setup` creates Product **Salon plan** and its $20 / month Price (it refuses non-test keys without `--live`, and will not create duplicates). Paste the printed `STRIPE_PRICE_ID` and `STRIPE_PRODUCT_ID` into `.env.local`.
4. **Customer portal.** Dashboard → Settings → Billing → **Customer portal** → save the default configuration (test mode needs this once, or "Manage billing" will fail).
5. **Webhooks locally.** Install the [Stripe CLI](https://docs.stripe.com/stripe-cli), `stripe login`, then `npm run stripe:listen`. It prints a `whsec_...` signing secret: put it in `.env.local` as `STRIPE_WEBHOOK_SECRET`.
6. `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (Stripe return URLs), then restart `npm run dev`.

For a deployed environment, add a webhook endpoint in the Dashboard pointing at `https://<your-domain>/api/stripe/webhook` with these events, and use its signing secret instead: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `payment_method.attached`.

## Test checklist

Keep `npm run stripe:listen` running in a second terminal; every step below should show `[200]` lines there. Sign in as the **owner** unless it says otherwise.

### A. Before subscribing
- [ ] Account › **Billings** shows status **Trial**, the trial end date, **$20 / month**, and **Start subscription**.
- [ ] A non-owner (receptionist) does **not** see the Billings tab.
- [ ] With the Stripe keys removed from `.env.local` (restart), Billings says billing is not set up and the dashboard is never locked.

### B. Success: `4242 4242 4242 4242`
Any future expiry, any CVC, any postcode.
- [ ] **Start subscription** opens Stripe Checkout showing the plan, and the trial ("free until …") if more than 48 hours of trial remain.
- [ ] Pay. You return to Billings with the "Thank you" banner.
- [ ] Within seconds Billings shows **Manage billing**, "Trial ends …", "Next charge …", and **Visa •••• 4242**. The listener shows `customer.subscription.created`, `invoice.created`, `invoice.finalized`, `invoice.paid`, `payment_method.attached`, all `[200]`.
- [ ] Billing history lists the invoice (a $0.00 trial invoice, or $20.00 if there was no trial) with View and PDF links.
- [ ] Database: one row in `subscriptions` (status `trialing` or `active`), `salons.stripe_subscription_id` set, `salons.subscription_status` matches.
- [ ] The audit log has **Subscription checkout started**.

### C. Declined: `4000 0000 0000 0002`
- [ ] At Checkout the card is declined with Stripe's message; nothing is created, and the salon stays on its trial.
- [ ] **Charge fails after the trial:** use `4000 0000 0000 0341` (attaches, then fails when charged). Subscribe, then in the Dashboard open the subscription → **End trial now** (or advance a test clock past the trial). `invoice.payment_failed` arrives; status becomes **Past due**; go to D.

### D. The gate
- [ ] With the salon `past_due`: as the **owner**, any dashboard page redirects to `/dashboard/account?tab=billing&reason=inactive` with the warning banner. The Account page itself still opens. Sign out works.
- [ ] As a **receptionist** in the same salon: every dashboard page shows **Subscription inactive** with a Sign out button, and nothing else.
- [ ] Restore: **Manage billing** → update the card to `4242 4242 4242 4242` → Stripe retries (or pay the open invoice from History). `invoice.paid` arrives; status returns to **Active**; the dashboard unlocks for both users.
- [ ] Local trial ending with no Stripe plan: `update salons set trial_ends_at = now() - interval '1 day' where id = '<salon id>';` → owner is redirected as above; **Start subscription** now charges immediately (no trial offered).

### E. 3-D Secure: `4000 0025 0000 3155`
- [ ] Checkout shows the 3-D Secure challenge. **Complete authentication** → subscription created as in B.
- [ ] Repeat and choose **Fail authentication** → Checkout reports the failure and no subscription is created.
- [ ] `4000 0000 0000 3220` also forces 3DS2 and is a good second pass.

### F. Cancel and change
- [ ] **Manage billing** → cancel at period end → Billings shows **Cancels at period end** and "Ends on …" (`cancel_at_period_end` true).
- [ ] `stripe subscriptions cancel <sub_id>` → `customer.subscription.deleted` → status **Cancelled**, dashboard locked, **Start subscription** offered again.
- [ ] Subscribing again after a cancellation works and the old subscription does not overwrite the new one.

### G. The webhook itself
- [ ] `curl -X POST localhost:3000/api/stripe/webhook -d '{}'` → **400**. A wrong or tampered signature → **400**.
- [ ] `stripe events resend <evt_id>` twice → both `[200]`, and the `subscriptions` / `invoices` rows are unchanged (idempotent).
- [ ] `stripe trigger invoice.paid` (a customer we do not know) → `[200]`, a "belongs to an unknown customer; ignored" line in the server log, no rows written.

### H. Isolation
- [ ] `npm run test:rls` and `npm run test:cascade` (they now cover both tables: owner-only reads, no writes by any signed-in user, cascade on salon delete).

## Billings tab (Phase 5b)

Owner only; not rendered or fetched for anyone else. **Top:** the plan card (price from the Stripe Price, next charge amount from a preview invoice, date and card from the subscription) and a read-only credit balance (the Stripe customer balance; Stripe applies it to invoices itself, there is no top-up). **Sub-tabs (`?sub=`):** *Billing history* (the `invoices` mirror, newest first, filter All / Paid / Open / Failed, **Pay now** and **Invoice**) and *Payment methods* (cards from Stripe, **Make default**, **Remove**, **Add card**).

- **Failed** means `uncollectible`, or `open` with `attempt_count > 0` (Stripe's attempt count, stored since migration 40).
- **Pay now** runs `invoices.pay` with the default card, then re-syncs that invoice at once rather than waiting for the webhook. A declined card shows Stripe's message; a card that needs authentication is sent to the invoice's own page via the "Invoice" link.
- **Make default** sets the customer's default *and* the live subscription's, so they cannot disagree. **Remove** is refused for the default card while a subscription is live (the button is replaced by a note, and the server refuses too).
- **Add card** uses Stripe's Payment Element: card numbers go from the browser to Stripe and never through this app. The first card saved becomes the default.
- **Audit log:** *Card added*, *Default card changed*, *Card removed* (brand and last four digits only).

### Additional checklist (owner)
- [ ] Billings top: the plan card shows $20.00 / month, status, next charge amount, date and card; the balance card shows $0.00. In the Dashboard, add a customer credit (Customers → the customer → Balance → Adjust, −$5): the balance card shows $5.00 and the next charge drops by it.
- [ ] **Billing history:** newest first; the filter narrows the table; **Invoice** opens the PDF. For a failed invoice (subscribe with `4000 0000 0000 0341`, end the trial) the row is **Failed** with **Pay now**. Update the default card to `4242…`, press **Pay now**: the row turns **Paid** without a refresh.
- [ ] **Payment methods:** the subscribed card is marked **Default**, and its **Remove** is replaced by the "Make another card the default" note.
- [ ] **Add card:** the Payment Element appears. `4242 4242 4242 4242` saves and is listed. `4000 0025 0000 3155` shows the 3-D Secure step. A declined card (`4000 0000 0000 9995` on setup) shows Stripe's message and saves nothing.
- [ ] **Make default** on the new card: the badge moves; Billings plan card shows the new card; the audit log has *Default card changed*. Now **Remove** the old card: it goes; the audit log has *Card removed*.
- [ ] A receptionist cannot open `?tab=billing` (the tab does not exist for them), and `POST`ing the actions as a non-owner is refused.

## Discounts (Phase 5c)

A third sub-tab, **Discounts** (`?sub=discounts`), owner only. Stripe is the whole source; nothing about a discount is stored locally.

- **Cards:** discounts on the Stripe customer and on the subscription (coupon name, percent or amount off, duration, end date, applies to, status **Active** / **Expired**). Stripe drops a discount from the subscription once it ends, so *Expired* cards come from the discounts seen on past invoices that are no longer applied, with "last applied to your <date> invoice".
- **Promo code:** `applyPromoCodeAction` looks the code up (as typed, then upper-cased), checks it, and adds it to the live subscription **alongside** any discounts already on it. Refusals, in plain words: empty; not valid; expired or inactive; used the maximum number of times; promotion ended; restricted to another account; already applied; cannot be applied to this subscription (a Stripe restriction); and "start your subscription first" when there is none. It is audited as **Promo code applied** (the code and promotion name).
- **History:** the Billing history table's Discount column is `invoices.discount_percent`, worked out by the webhook from Stripe's own `total_discount_amounts` against the invoice subtotal (so an amount-off coupon shows its effective percentage).
- **Not a rule:** the mockup's "Solo salon" (100 % for a team of one) was confirmed *not* to be a pricing rule. There is no team-size pricing; the plan is a flat $20 per salon.

### Checklist
Create test promotions first (Dashboard → Product catalogue → Coupons, or the CLI):
`stripe coupons create --percent-off=20 --duration=once --name="Autumn 20" ` then
`stripe promotion_codes create --promotion.type=coupon --promotion.coupon=<coupon id> --code=AUTUMN20`.
Variants: `--expires-at=<past unix time>` (expired), `--active=false` (inactive), `--max-redemptions=1` (use it twice), and a coupon with `--amount-off=500 --currency=usd`.

- [ ] With no subscription: the promo field is disabled with "Start your subscription first".
- [ ] Subscribed: enter `AUTUMN20`. A success banner appears, an **Autumn 20 · 20% off** card shows **Active** with Code `AUTUMN20`, and the audit log has *Promo code applied*. *Upcoming* charge on the plan card drops by 20 %.
- [ ] Enter `AUTUMN20` again: "already applied". Enter `autumn20` (lower case): found, and also "already applied".
- [ ] `NOPE123` → "not valid". The expired code → "expired or no longer active". The inactive code → same. The one-use code, used by another test account first → "maximum number of times".
- [ ] Apply a second, different code: both cards show Active (they stack).
- [ ] After the next invoice (advance a test clock, or `stripe trigger invoice.paid` against a real customer's subscription), Billing history shows the discount percentage on that row.
- [ ] Remove the discount in the Dashboard (subscription → discount → remove): the card moves to **Expired** with "last applied …" once an invoice carrying it exists.
- [ ] A receptionist cannot reach the tab; posting `applyPromoCodeAction` as a non-owner is refused.
