-- =============================================================================
-- Branches, step 2: carry the hand-made branches over (after migration 46)
--
-- Only does anything when 20261021000045 set a legacy table aside. Migration 46
-- has by now given every salon its own Main Branch and put every existing row in
-- it. This brings across the branches people created by hand, with their ids, and
-- moves the few rows that really belonged to one of them (a team member, an
-- invitation; and, if any, visits and sales) back to it. Rows that only carried
-- the old placeholder branch (everyone's default, which pointed at ANOTHER
-- salon's branch) stay in their own salon's Main Branch.
--
-- Then the legacy_branch_id columns are dropped. The branches_legacy table stays,
-- with no access, as the record of what was there.
-- =============================================================================

do $$
declare
  v_table text;
begin
  if to_regclass('public.branches_legacy') is null then
    return;
  end if;

  -- A branch that is open in the old table, or closed there, under a name the salon
  -- does not already have. Same id, so anything pointing at it keeps pointing.
  insert into public.branches (id, salon_id, name, address, is_default, is_active, created_at)
  select l.id, l.salon_id, btrim(l.name), coalesce(l.address, ''), false,
         coalesce(l.is_active, true) and not coalesce(l.is_closed, false),
         coalesce(l.created_at, now())
  from public.branches_legacy l
  join public.salons s on s.id = l.salon_id
  where btrim(l.name) <> ''
    and not exists (
      select 1 from public.branches b
      where b.salon_id = l.salon_id and lower(btrim(b.name)) = lower(btrim(l.name))
    );

  -- Same trick as migration 46: the append-only and immutability guards would
  -- refuse these updates, so user triggers are off for this step only.
  alter table public.team_members disable trigger user;
  alter table public.invitations  disable trigger user;
  alter table public.appointments disable trigger user;
  alter table public.receipts     disable trigger user;
  alter table public.receipt_line_items disable trigger user;
  alter table public.payments     disable trigger user;

  update public.team_members tm
  set branch_id = tm.legacy_branch_id
  where tm.legacy_branch_id is not null
    and exists (select 1 from public.branches b
                where b.id = tm.legacy_branch_id and b.salon_id = tm.salon_id and not b.is_default);

  update public.invitations i
  set branch_id = i.legacy_branch_id
  where i.legacy_branch_id is not null
    and exists (select 1 from public.branches b
                where b.id = i.legacy_branch_id and b.salon_id = i.salon_id and not b.is_default);

  -- A visit is at its team member's branch; a sale where it was made.
  update public.appointments a
  set branch_id = tm.branch_id
  from public.team_members tm
  where tm.id = a.staff_id and tm.salon_id = a.salon_id and tm.branch_id <> a.branch_id;

  update public.receipts r
  set branch_id = r.legacy_branch_id
  where r.legacy_branch_id is not null
    and exists (select 1 from public.branches b
                where b.id = r.legacy_branch_id and b.salon_id = r.salon_id and not b.is_default);

  update public.receipt_line_items li
  set branch_id = r.branch_id
  from public.receipts r
  where r.id = li.receipt_id and li.branch_id <> r.branch_id;

  update public.payments p
  set branch_id = coalesce(
    (select r.branch_id from public.receipts r where r.id = p.receipt_id),
    (select a.branch_id from public.appointments a where a.id = p.appointment_id),
    p.branch_id
  )
  where p.branch_id is distinct from coalesce(
    (select r.branch_id from public.receipts r where r.id = p.receipt_id),
    (select a.branch_id from public.appointments a where a.id = p.appointment_id),
    p.branch_id
  );

  alter table public.team_members enable trigger user;
  alter table public.invitations  enable trigger user;
  alter table public.appointments enable trigger user;
  alter table public.receipts     enable trigger user;
  alter table public.receipt_line_items enable trigger user;
  alter table public.payments     enable trigger user;

  foreach v_table in array array['appointments', 'invitations', 'payments', 'receipts', 'team_members']
  loop
    execute format('alter table public.%I drop column if exists legacy_branch_id', v_table);
  end loop;
end;
$$;
