-- =============================================================================
-- Invoices: remember how many times Stripe has tried to collect
--
-- Phase 5b. The Billings tab filters history by Paid / Open / Failed, and "Failed"
-- is not a Stripe invoice status: a failed card leaves the invoice `open` with
-- retries scheduled. What distinguishes it is Stripe's attempt_count, so the
-- webhook now stores it. Failed = status `uncollectible`, or `open` with at
-- least one attempt made.
--
-- Additive, defaulted, no policy change: the invoices policies from
-- 20260924000039 (owner can read, only the service role writes) cover it.
-- =============================================================================

alter table public.invoices
  add column attempt_count integer not null default 0
    constraint invoices_attempt_count_check check (attempt_count >= 0);

comment on column public.invoices.attempt_count is
  'Stripe''s attempt_count: collection attempts made so far. An open invoice with attempts > 0 is a failed payment.';
