-- =============================================================================
-- Row Level Security that costs one lookup per query, not one per row
--
-- Measured on 190,000 receipts (150,000 in one salon): a 30-day Reports query took
-- about 15 seconds, and every one of the report functions about as long. The
-- policies on receipts, receipt lines, payments, appointments and the rest call
-- has_module(...) and can_access_branch(branch_id) in their conditions. Both read
-- the caller's profile, and Postgres calls a function in a policy once PER ROW
-- unless it is wrapped as `(select f())`, which makes it an InitPlan evaluated
-- once. So every row cost two profile lookups, and the policy conditions run
-- before any date filter the query adds.
--
-- This changes only HOW the same rule is evaluated, never what it allows:
--   * has_module('x'), is_owner(), current_team_member_id() and current_branch_id()
--     are wrapped as (select ...) wherever a policy uses them.
--   * can_access_branch(x) becomes a comparison against branch_scope(), which says
--     once per query which branches the caller may touch: NULL for every branch
--     (an owner with none chosen), an empty list for none (no active profile),
--     otherwise the one branch (assigned, or chosen in the top bar). The result is
--     identical to can_access_branch(x) for every x, including NULL.
-- Measured afterwards on the same data: 15 s -> 0.18 s for the 30-day query.
--
-- The policies are rewritten from what the database holds, so a policy added by
-- any earlier migration is covered, and running this twice changes nothing.
-- =============================================================================

create or replace function public.branch_scope()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.id is null or not p.is_active then '{}'::uuid[]
    when p.branch_id is not null then array[p.branch_id]
    when public.active_branch_filter() is not null then array[public.active_branch_filter()]
    else null::uuid[]
  end
  from (select 1) one
  left join public.profiles p on p.id = (select auth.uid())
$$;

revoke execute on function public.branch_scope() from public;
grant execute on function public.branch_scope() to authenticated, service_role;

create or replace function pg_temp.rls_fast(p_expr text)
returns text
language plpgsql
as $$
declare
  v_out   text := p_expr;
  v_start integer;
  v_depth integer;
  v_pos   integer;
  v_arg   text;
begin
  v_out := regexp_replace(
    v_out, 'has_module\(([''a-z_]+''::app_module)\)', '(SELECT public.has_module(\1))', 'g');
  v_out := regexp_replace(v_out, '\mis_owner\(\)', '(SELECT public.is_owner())', 'g');
  v_out := regexp_replace(
    v_out, '\mcurrent_team_member_id\(\)', '(SELECT public.current_team_member_id())', 'g');
  v_out := regexp_replace(
    v_out, '\mcurrent_branch_id\(\)', '(SELECT public.current_branch_id())', 'g');

  -- can_access_branch(<anything, parentheses balanced>)
  loop
    v_start := position('can_access_branch(' in v_out);
    exit when v_start = 0;
    v_depth := 1;
    v_pos := v_start + length('can_access_branch(');
    while v_depth > 0 loop
      if v_pos > length(v_out) then
        raise exception 'unbalanced parentheses in policy expression: %', p_expr;
      end if;
      case substr(v_out, v_pos, 1)
        when '(' then v_depth := v_depth + 1;
        when ')' then v_depth := v_depth - 1;
        else null;
      end case;
      v_pos := v_pos + 1;
    end loop;
    v_arg := substr(v_out, v_start + length('can_access_branch('),
                    v_pos - (v_start + length('can_access_branch(')) - 1);
    v_out := substr(v_out, 1, v_start - 1)
      || 'COALESCE(((SELECT public.branch_scope()) IS NULL) OR ((' || v_arg
      || ') = ANY (COALESCE((SELECT public.branch_scope()), ''{}''::uuid[]))), false)'
      || substr(v_out, v_pos);
  end loop;

  return v_out;
end;
$$;

do $$
declare
  v_pol    record;
  v_using  text;
  v_check  text;
  v_new_u  text;
  v_new_c  text;
  v_sql    text;
begin
  for v_pol in
    select c.relname, p.polname,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as chk
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace
  loop
    v_using := v_pol.qual;
    v_check := v_pol.chk;

    -- Already done (or never needed): nothing to change.
    v_new_u := case when v_using is null then null else pg_temp.rls_fast(v_using) end;
    v_new_c := case when v_check is null then null else pg_temp.rls_fast(v_check) end;
    continue when v_new_u is not distinct from v_using and v_new_c is not distinct from v_check;
    -- A rewrite of an already-rewritten policy would wrap twice.
    continue when coalesce(v_using, '') || coalesce(v_check, '') like '%branch_scope%'
               or coalesce(v_using, '') || coalesce(v_check, '') ~ 'SELECT (public\.)?(has_module|is_owner)';

    v_sql := format('alter policy %I on public.%I', v_pol.polname, v_pol.relname);
    if v_new_u is not null then v_sql := v_sql || format(' using (%s)', v_new_u); end if;
    if v_new_c is not null then v_sql := v_sql || format(' with check (%s)', v_new_c); end if;
    execute v_sql;
  end loop;
end;
$$;
