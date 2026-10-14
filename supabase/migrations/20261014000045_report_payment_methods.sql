-- =============================================================================
-- Reports: how customers paid
--
-- Money collected by each method over a date range, for the Reports page. It
-- reads the same receipts the other reports do, so it follows the same rules:
--
--   * SECURITY INVOKER: Row Level Security still decides which receipts the
--     caller can see, and report_context() refuses anyone without the Reports
--     module (CLAUDE.md rule 6).
--   * Voided receipts are excluded.
--   * The range is salon-local calendar days, bucketed `at time zone` the
--     salon's own timezone, never the server clock.
--   * The sums are done here, in Postgres, not in the page (rule 4).
--
-- A receipt states its own settlement: cash + card + transfer + deposit_applied
-- = total (a check constraint). So summing each column gives, per method, what
-- was taken at the till, and `advance_total` is what had already been paid in
-- advance (deposits) and applied to these bills. The four add up to the
-- period's Revenue exactly. A split sale contributes to each method it used.
-- =============================================================================

-- Functions of this name that are NOT part of this project were found in the live
-- database before this migration was applied, and both fail:
--
--   (p_salon_id, p_start_date, p_end_date)  "column r.items does not exist"; it also
--       takes the salon id from the CALLER, which the other reports are built never
--       to do: the salon always comes from the signed-in user, inside Postgres.
--   (p_from, p_to)                          "column owner_id does not exist" and an
--       enum comparison against 'Cash' (the values are cash, card, bank_transfer).
--
-- Postgres will not change the columns a function returns with `create or replace`
-- (error 42P13), so both are dropped and the right one created. Harmless on a
-- database that has neither.
drop function if exists public.report_payment_methods(uuid, date, date);
drop function if exists public.report_payment_methods(date, date);

create or replace function public.report_payment_methods(p_from date, p_to date)
returns table (
  receipt_count     bigint,
  cash_total        numeric,
  card_total        numeric,
  transfer_total    numeric,
  advance_total     numeric,
  cash_receipts     bigint,
  card_receipts     bigint,
  transfer_receipts bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz text;
begin
  select rc.timezone into v_tz from public.report_context() rc;

  return query
  select
    count(*)::bigint,
    round(coalesce(sum(r.cash_amount), 0), 2),
    round(coalesce(sum(r.card_amount), 0), 2),
    round(coalesce(sum(r.transfer_amount), 0), 2),
    round(coalesce(sum(r.deposit_applied), 0), 2),
    (count(*) filter (where r.cash_amount > 0))::bigint,
    (count(*) filter (where r.card_amount > 0))::bigint,
    (count(*) filter (where r.transfer_amount > 0))::bigint
  from public.receipts r
  where r.status = 'issued'
    and (r.created_at at time zone v_tz)::date between p_from and p_to;
end;
$$;

revoke execute on function public.report_payment_methods(date, date) from public;
grant execute on function public.report_payment_methods(date, date) to authenticated, service_role;

-- Make the API pick up the new function without waiting for its own refresh.
notify pgrst, 'reload schema';
