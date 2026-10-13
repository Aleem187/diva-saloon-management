-- =============================================================================
-- Stripe billing: subscriptions and invoices
--
-- Phase 5a. Stripe is the source of truth for billing; these two tables are a
-- local mirror, kept current by the webhook (src/app/api/stripe/webhook), so the
-- Billings tab can show status and history without a Stripe call per page view.
--
-- Who may touch them:
--   read   the OWNER of the salon, and nobody else. Billing is the owner's
--          business: a receptionist or an accountant role does not see it.
--   write  the service role only. There is deliberately NO insert, update or
--          delete policy, so under RLS no signed-in user can write a row; the
--          service role bypasses RLS and is what the webhook uses. (This is the
--          one place outside the Auth admin API that the service-role client
--          writes tenant tables: a webhook has no user session to write as.)
--
-- The salon's own billing columns (stripe_customer_id, stripe_subscription_id,
-- subscription_status, current_period_end) already exist on `salons` and are
-- updated by the same webhook. The dashboard gate reads them from there, in the
-- query that already loads the salon.
--
-- Rule 8 (CLAUDE.md): each table has its OWN salon_id referencing salons on
-- delete cascade, so deleting a salon cannot be blocked by either of them.
--
-- Money: Stripe reports amounts in the currency's minor unit, and so do the
-- invoice columns here (2000 = $20.00). The app converts for display.
-- =============================================================================

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  salon_id               uuid not null references public.salons (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id     text not null,
  -- Stripe's own status, verbatim: trialing, active, past_due, canceled,
  -- incomplete, incomplete_expired, unpaid, paused. (salons.subscription_status
  -- holds the app's narrower enum.)
  status                 text not null,
  current_period_end     timestamptz,
  trial_end              timestamptz,
  cancel_at_period_end   boolean not null default false,
  -- "Visa •••• 4242". Kept here too because a payment_method.attached event
  -- carries no invoice to hang it on.
  payment_method_label   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index subscriptions_salon_idx on public.subscriptions (salon_id);
create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.invoices (
  id                     uuid primary key default gen_random_uuid(),
  salon_id               uuid not null references public.salons (id) on delete cascade,
  stripe_invoice_id      text not null unique,
  stripe_subscription_id text,
  number                 text,
  -- When Stripe created the invoice (not when this row was written).
  created_at             timestamptz not null,
  amount_due             bigint not null,
  amount_paid            bigint not null,
  currency               text not null,
  -- draft, open, paid, uncollectible, void
  status                 text not null,
  discount_percent       numeric(6, 2) not null default 0,
  payment_method_label   text,
  hosted_invoice_url     text,
  invoice_pdf            text,
  updated_at             timestamptz not null default now()
);

create index invoices_salon_created_idx on public.invoices (salon_id, created_at desc);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security. Not FORCE: see the note in the Phase 1 migration.
-- -----------------------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;

create policy subscriptions_select_owner_only
  on public.subscriptions for select to authenticated
  using (salon_id = public.current_salon_id() and public.is_owner());

create policy invoices_select_owner_only
  on public.invoices for select to authenticated
  using (salon_id = public.current_salon_id() and public.is_owner());

-- Belt and braces: with no write policy RLS already refuses these, but the
-- privilege itself is not granted either, so a policy added by mistake later
-- would still not open a write path.
revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke insert, update, delete on public.invoices from anon, authenticated;

comment on table public.subscriptions is
  'Mirror of the salon''s Stripe subscription(s), written only by the webhook (service role). Readable by the salon owner.';
comment on table public.invoices is
  'Mirror of the salon''s Stripe invoices, written only by the webhook (service role). Amounts are in the currency''s minor unit. Readable by the salon owner.';
