-- =============================================================================
-- Branches, step 0: set aside a hand-made `branches` table, if there is one
--
-- Some databases got a `branches` table before migration 20261021000046 existed
-- (columns is_closed / is_active / is_default, nullable salon_id, no
-- unique (id, salon_id), and policies that let any signed-in user read and write
-- every salon's branches). Migration 46 cannot run on top of it: it creates the
-- table, and its composite foreign keys need unique (id, salon_id).
--
-- So, ONLY when that legacy shape is found (the is_closed column), this:
--   * drops its policies (they were open to every tenant),
--   * drops the single-column foreign keys other tables had to it, and renames
--     their branch_id columns to legacy_branch_id so migration 46 can add its own,
--   * renames the table to branches_legacy and takes it away from the API roles.
-- Migration 20261021000047 (after 46) carries the real branches over and drops
-- the legacy columns. branches_legacy itself is kept, locked, until someone
-- drops it by hand.
--
-- It also drops `trigger_guard_profile_self_update`, a trigger that is not part of
-- these migrations: it calls public.is_salon_owner(uuid), which does not exist,
-- so every update of a profile by a signed-in user fails.
--
-- A database without the legacy table (every fresh install) is untouched.
-- =============================================================================

do $$
declare
  v_table text;
  v_policy record;
begin
  if to_regclass('public.branches') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'branches' and column_name = 'is_closed'
     )
  then
    for v_policy in select polname from pg_policy where polrelid = 'public.branches'::regclass
    loop
      execute format('drop policy %I on public.branches', v_policy.polname);
    end loop;

    foreach v_table in array array['appointments', 'invitations', 'payments', 'receipts', 'team_members']
    loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table and column_name = 'branch_id'
      ) then
        execute format('alter table public.%I drop constraint if exists %I', v_table, v_table || '_branch_id_fkey');
        execute format('alter table public.%I alter column branch_id drop default', v_table);
        execute format('alter table public.%I rename column branch_id to legacy_branch_id', v_table);
      end if;
    end loop;

    alter table public.branches rename to branches_legacy;
    alter table public.branches_legacy rename constraint branches_pkey to branches_legacy_pkey;
    alter table public.branches_legacy
      rename constraint branches_salon_id_fkey to branches_legacy_salon_id_fkey;
    revoke all on public.branches_legacy from anon, authenticated;

    drop trigger if exists trigger_guard_profile_self_update on public.profiles;
    drop function if exists public.guard_profile_self_update();
  end if;
end;
$$;
