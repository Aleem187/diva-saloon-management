-- =============================================================================
-- Customer search indexes
--
-- The customer directory and the till's customer picker search with
-- `ilike '%text%'` on full_name and phone_normalized. A leading wildcard cannot
-- use an ordinary btree index (customers_salon_name_idx only helps a prefix on
-- lower(full_name)), so every search read every customer in the salon.
--
-- Trigram GIN indexes make those searches index-assisted. Row Level Security
-- still applies on top: the planner combines these with the salon filter, so
-- nothing about who may see which row changes.
--
-- Every other query path audited for this migration (salon_id plus a date range,
-- status, actor or action on receipts, line items, appointments, payments,
-- payroll, audit_logs and loyalty) is already covered by an existing index.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- The operator class lives wherever pg_trgm was installed: `extensions` on a project
-- made from these migrations, `public` on one where the extension was added by hand.
-- Look it up rather than assume.
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format(
    'create index if not exists customers_full_name_trgm_idx on public.customers using gin (full_name %I.gin_trgm_ops)',
    v_schema);
  execute format(
    'create index if not exists customers_phone_trgm_idx on public.customers using gin (phone_normalized %I.gin_trgm_ops)',
    v_schema);
end;
$$;
