-- =============================================================================
-- Branches: several locations inside one salon
--
-- One salon (one subscription, one customer list with one loyalty balance, one
-- service menu and price list) can now run several BRANCHES. What happens at a
-- branch belongs to it: its appointments, receipts and payments, and the team
-- members who work there. Who sees what:
--
--   owner               every branch, or one at a time by choosing it in the top
--                       bar (see "the active branch" below)
--   everyone else       only the branch their login is assigned to, enforced here
--                       by Row Level Security, not by the application
--
-- ZERO DATA LOSS. Every existing salon gets a branch called "Main Branch" and
-- everything that already exists is placed in it. Nothing is deleted or
-- re-numbered, and the guard triggers that keep receipts, payments and receipt
-- lines immutable are stepped around ONLY to add the new column (inside this
-- migration's transaction) and switched straight back on. The migration changes
-- no amount, date, status or number.
--
-- The active branch. The owner picks "All branches" or one branch in the top bar.
-- The app sends that choice as the `x-branch-id` request header, which PostgREST
-- exposes to Postgres as request.headers. It can only NARROW what an owner sees:
-- for anyone assigned to a branch it is ignored, and a header naming a branch the
-- caller could not reach gives them nothing extra. So it scopes every query and
-- every SECURITY INVOKER report at once, with no per-page filter to forget.
--
-- Rules kept (CLAUDE.md): every tenant table has its OWN salon_id ... on delete
-- cascade; foreign keys to other tenant tables are composite (id, salon_id) and
-- NO ACTION, never RESTRICT.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. branches
-- -----------------------------------------------------------------------------
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  address     text not null default '',
  -- The branch that existed before branches did. Exactly one per salon, and it
  -- is where anything with no better answer lands.
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, salon_id)
);

create unique index branches_salon_name_key on public.branches (salon_id, lower(btrim(name)));
create unique index branches_one_default_per_salon on public.branches (salon_id) where is_default;

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

alter table public.branches enable row level security;

-- Every salon that exists gets its Main Branch...
insert into public.branches (salon_id, name, is_default)
select s.id, 'Main Branch', true from public.salons s;

-- ...and so does every salon created from now on (handle_new_user inserts the
-- salon, then the owner's roster entry, which needs a branch to land in).
create or replace function public.create_default_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.branches (salon_id, name, is_default) values (new.id, 'Main Branch', true);
  return new;
end;
$$;

create trigger salons_create_default_branch
  after insert on public.salons
  for each row execute function public.create_default_branch();

create or replace function public.default_branch_id(p_salon_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.branches b where b.salon_id = p_salon_id and b.is_default limit 1
$$;

-- -----------------------------------------------------------------------------
-- 2. The branch column, on everything that happens at a branch
-- -----------------------------------------------------------------------------
alter table public.profiles           add column branch_id uuid;
alter table public.invitations        add column branch_id uuid;
alter table public.team_members       add column branch_id uuid;
alter table public.appointments       add column branch_id uuid;
alter table public.receipts           add column branch_id uuid;
alter table public.receipt_line_items add column branch_id uuid;
alter table public.payments           add column branch_id uuid;

comment on column public.profiles.branch_id is
  'The one branch this login belongs to. NULL means every branch, and only an owner may be NULL.';
comment on column public.team_members.branch_id is 'Where this person works.';
comment on column public.appointments.branch_id is 'Always the branch of the team member the visit is booked with.';
comment on column public.receipts.branch_id is 'Where the sale was made. Never changes.';
comment on column public.payments.branch_id is 'Follows the receipt or appointment it is for. Never changes.';

-- -----------------------------------------------------------------------------
-- 3. Put everything that exists into its salon's Main Branch
--
-- User triggers are switched off on the affected tables for this step only. They
-- are the append-only and immutability guards (which would refuse ANY update of
-- a receipt line or a payment) and the updated_at stamps (which would otherwise
-- rewrite when every row was last touched). The switch-off is inside this
-- transaction, so nothing else can write while it is off, and system triggers
-- (the foreign keys) stay on.
-- -----------------------------------------------------------------------------
alter table public.profiles           disable trigger user;
alter table public.invitations        disable trigger user;
alter table public.team_members       disable trigger user;
alter table public.appointments       disable trigger user;
alter table public.receipts           disable trigger user;
alter table public.receipt_line_items disable trigger user;
alter table public.payments           disable trigger user;

update public.team_members tm
set branch_id = public.default_branch_id(tm.salon_id);

update public.appointments a
set branch_id = public.default_branch_id(a.salon_id);

update public.receipts r
set branch_id = public.default_branch_id(r.salon_id);

update public.receipt_line_items li
set branch_id = r.branch_id
from public.receipts r
where r.id = li.receipt_id;

update public.payments p
set branch_id = coalesce(
  (select r.branch_id from public.receipts r where r.id = p.receipt_id),
  (select a.branch_id from public.appointments a where a.id = p.appointment_id),
  public.default_branch_id(p.salon_id)
);

-- Logins: the owner stays NULL (every branch); everyone else joins the Main Branch.
update public.profiles p
set branch_id = public.default_branch_id(p.salon_id)
where not exists (
  select 1 from public.roles r where r.id = p.role_id and r.is_owner
);

alter table public.profiles           enable trigger user;
alter table public.invitations        enable trigger user;
alter table public.team_members       enable trigger user;
alter table public.appointments       enable trigger user;
alter table public.receipts           enable trigger user;
alter table public.receipt_line_items enable trigger user;
alter table public.payments           enable trigger user;

-- -----------------------------------------------------------------------------
-- 4. Now that every row has one: required, tied to a real branch of the SAME
--    salon (composite key), and indexed for the scoping queries.
-- -----------------------------------------------------------------------------
alter table public.team_members       alter column branch_id set not null;
alter table public.appointments       alter column branch_id set not null;
alter table public.receipts           alter column branch_id set not null;
alter table public.receipt_line_items alter column branch_id set not null;
alter table public.payments           alter column branch_id set not null;

alter table public.profiles
  add constraint profiles_branch_fk foreign key (branch_id, salon_id)
    references public.branches (id, salon_id);
alter table public.invitations
  add constraint invitations_branch_fk foreign key (branch_id, salon_id)
    references public.branches (id, salon_id);
alter table public.team_members
  add constraint team_members_branch_fk foreign key (branch_id, salon_id)
    references public.branches (id, salon_id);
alter table public.appointments
  add constraint appointments_branch_fk foreign key (branch_id, salon_id)
    references public.branches (id, salon_id);
alter table public.receipts
  add constraint receipts_branch_fk foreign key (branch_id, salon_id)
    references public.branches (id, salon_id);
alter table public.receipt_line_items
  add constraint receipt_line_items_branch_fk foreign key (branch_id, salon_id)
    references public.branches (id, salon_id);
alter table public.payments
  add constraint payments_branch_fk foreign key (branch_id, salon_id)
    references public.branches (id, salon_id);

create index profiles_branch_idx           on public.profiles (branch_id) where branch_id is not null;
create index team_members_branch_idx       on public.team_members (branch_id);
create index appointments_branch_start_idx on public.appointments (branch_id, starts_at);
create index receipts_branch_created_idx   on public.receipts (branch_id, created_at desc);
create index receipt_line_items_branch_idx on public.receipt_line_items (branch_id, performed_at desc);
create index payments_branch_paid_idx      on public.payments (branch_id, paid_at desc);

-- -----------------------------------------------------------------------------
-- 5. Who can reach which branch
-- -----------------------------------------------------------------------------

-- The owner's choice from the top bar ("All branches" sends nothing). Read from
-- the request header PostgREST exposes; anything that is not a UUID is nothing.
create or replace function public.active_branch_filter()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case when h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then h::uuid end
  from (
    select nullif(current_setting('request.headers', true), '')::json ->> 'x-branch-id' as h
  ) s
$$;

-- The branch this login is assigned to. NULL for an owner (every branch).
create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.branch_id from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

/*
 * May the caller see and change rows of this branch?
 *   assigned to a branch   only that branch, whatever any header says
 *   owner (no branch)      every branch, or only the active one when chosen
 * A row with no branch is visible only to an owner looking at everything.
 */
create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.branch_id is not null then p_branch_id = p.branch_id
      when p_branch_id is null then public.active_branch_filter() is null
      else public.active_branch_filter() is null or public.active_branch_filter() = p_branch_id
    end
    from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  ), false)
$$;

create or replace function public.staff_branch_id(p_staff_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.branch_id from public.team_members tm where tm.id = p_staff_id
$$;

/*
 * Where a new row with no better answer belongs: the caller's own branch; for an
 * owner, the branch chosen in the top bar; failing that, the salon's only open
 * branch. An owner on "All branches" in a salon with several is asked to choose,
 * rather than having a sale quietly filed under the wrong location.
 */
create or replace function public.resolve_new_row_branch(p_salon_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch uuid := public.current_branch_id();
  v_open   integer;
begin
  if v_branch is not null then
    return v_branch;
  end if;

  v_branch := public.active_branch_filter();
  if v_branch is not null and exists (
    select 1 from public.branches b
    where b.id = v_branch and b.salon_id = p_salon_id and b.is_active
  ) then
    return v_branch;
  end if;

  -- No signed-in person (the signup trigger, the service role): there is nobody to
  -- ask, so the Main Branch. An invited member's own branch is passed in by
  -- handle_new_user, so this is only the fallback.
  if (select auth.uid()) is null then
    return public.default_branch_id(p_salon_id);
  end if;

  select count(*), min(b.id::text)::uuid into v_open, v_branch
  from public.branches b where b.salon_id = p_salon_id and b.is_active;

  if v_open = 1 then
    return v_branch;
  end if;
  raise exception 'Choose a branch in the top bar first: this salon has more than one.';
end;
$$;

create or replace function public.assert_branch_open(p_branch_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.is_active) then
    raise exception 'That branch is closed';
  end if;
end;
$$;

-- A signed-in caller may only write into a branch they can reach. (The service
-- role has no profile and is not subject to this, as it is not to RLS.)
create or replace function public.assert_branch_access(p_branch_id uuid, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.can_access_branch(p_branch_id) then
    raise exception '% belongs to another branch', p_what;
  end if;
end;
$$;

/*
 * May the caller MANAGE people and records of this branch? Unlike can_access_branch
 * this is not narrowed by the owner's view filter: choosing "Branch 2" in the top
 * bar changes what the owner LOOKS at, not what they are allowed to administer.
 * An owner may manage every branch; anyone else only their own.
 */
create or replace function public.can_manage_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when p.branch_id is not null then p_branch_id = p.branch_id else true end
    from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  ), false)
$$;

create or replace function public.assert_branch_manage(p_branch_id uuid, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.can_manage_branch(p_branch_id) then
    raise exception '% belongs to another branch', p_what;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. The branches table itself
-- -----------------------------------------------------------------------------
create policy branches_select_own_or_owner
  on public.branches for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and (public.is_owner() or id = public.current_branch_id())
  );

create policy branches_insert_owner
  on public.branches for insert to authenticated
  with check (salon_id = public.current_salon_id() and public.is_owner() and not is_default);

create policy branches_update_owner
  on public.branches for update to authenticated
  using (salon_id = public.current_salon_id() and public.is_owner())
  with check (salon_id = public.current_salon_id() and public.is_owner());

-- No delete policy: a branch with history is closed, never removed.

create or replace function public.guard_branch_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.salon_id is distinct from old.salon_id then
    raise exception 'A branch cannot be moved between salons';
  end if;
  if new.is_default is distinct from old.is_default then
    raise exception 'Which branch is the main one cannot be changed';
  end if;
  if old.is_active and not new.is_active then
    if new.is_default then
      raise exception 'The Main Branch cannot be closed';
    end if;
    -- Nobody could be booked, sold to or paid anywhere without an open branch.
    if not exists (
      select 1 from public.branches b
      where b.salon_id = new.salon_id and b.is_active and b.id <> new.id
    ) then
      raise exception 'A salon must keep at least one open branch';
    end if;
  end if;
  return new;
end;
$$;

create trigger branches_guard_changes
  before update on public.branches
  for each row execute function public.guard_branch_changes();

-- -----------------------------------------------------------------------------
-- 7. Rows take their branch from where they belong
-- -----------------------------------------------------------------------------

-- A visit is at the branch of the person it is booked with.
create or replace function public.appointments_assign_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch uuid;
begin
  if tg_op = 'UPDATE' then
    perform public.assert_branch_access(old.branch_id, 'That appointment');
    if new.staff_id is not distinct from old.staff_id then
      new.branch_id := old.branch_id;
      return new;
    end if;
  end if;

  select tm.branch_id into v_branch
  from public.team_members tm
  where tm.id = new.staff_id and tm.salon_id = new.salon_id;

  if v_branch is null then
    return new;  -- the foreign key on staff_id will refuse a stranger
  end if;

  if tg_op = 'INSERT' then
    perform public.assert_branch_open(v_branch);
  end if;
  perform public.assert_branch_access(v_branch, 'That team member');
  new.branch_id := v_branch;
  return new;
end;
$$;

create trigger appointments_assign_branch
  before insert or update on public.appointments
  for each row execute function public.appointments_assign_branch();

-- A sale is at the branch of the visit it settles, else where it was rung up.
create or replace function public.receipts_assign_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch uuid;
begin
  if new.appointment_id is not null then
    select a.branch_id into v_branch
    from public.appointments a
    where a.id = new.appointment_id and a.salon_id = new.salon_id;
  end if;

  v_branch := coalesce(v_branch, new.branch_id, public.resolve_new_row_branch(new.salon_id));

  perform public.assert_branch_open(v_branch);
  perform public.assert_branch_access(v_branch, 'That sale');
  new.branch_id := v_branch;
  return new;
end;
$$;

create trigger receipts_assign_branch
  before insert on public.receipts
  for each row execute function public.receipts_assign_branch();

create or replace function public.receipt_lines_assign_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select r.branch_id into new.branch_id
  from public.receipts r where r.id = new.receipt_id;
  return new;
end;
$$;

create trigger receipt_lines_assign_branch
  before insert on public.receipt_line_items
  for each row execute function public.receipt_lines_assign_branch();

-- Money follows the sale or the visit it is for. (No "is it open" check: a
-- refund on a closed branch's sale must still go through.)
create or replace function public.payments_assign_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch uuid;
begin
  if new.receipt_id is not null then
    select r.branch_id into v_branch from public.receipts r where r.id = new.receipt_id;
  end if;
  if v_branch is null and new.appointment_id is not null then
    select a.branch_id into v_branch from public.appointments a where a.id = new.appointment_id;
  end if;

  v_branch := coalesce(v_branch, new.branch_id, public.resolve_new_row_branch(new.salon_id));

  perform public.assert_branch_access(v_branch, 'That payment');
  new.branch_id := v_branch;
  return new;
end;
$$;

create trigger payments_assign_branch
  before insert on public.payments
  for each row execute function public.payments_assign_branch();

-- A team member works at one branch. Moving them is the owner's decision, and
-- their past appointments and sales stay where they happened.
create or replace function public.team_members_assign_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.branch_id := coalesce(new.branch_id, public.resolve_new_row_branch(new.salon_id));
    perform public.assert_branch_open(new.branch_id);
    perform public.assert_branch_manage(new.branch_id, 'That branch');
  elsif new.branch_id is distinct from old.branch_id then
    if (select auth.uid()) is not null and not public.is_owner() then
      raise exception 'Only the owner can move a team member to another branch';
    end if;
    perform public.assert_branch_open(new.branch_id);
  end if;
  return new;
end;
$$;

create trigger team_members_assign_branch
  before insert or update on public.team_members
  for each row execute function public.team_members_assign_branch();

-- Logins: everyone but the owner belongs to exactly one branch. An invited login
-- takes the branch its invitation named, else the Main Branch.
create or replace function public.profiles_branch_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner  boolean;
  v_branch uuid;
begin
  select coalesce(r.is_owner, false) into v_owner
  from public.roles r where r.id = new.role_id and r.salon_id = new.salon_id;
  v_owner := coalesce(v_owner, false);

  if v_owner then
    new.branch_id := null;
    return new;
  end if;

  if tg_op = 'INSERT' and new.branch_id is null then
    select i.branch_id into v_branch
    from public.invitations i where i.accepted_user_id = new.id limit 1;
    new.branch_id := coalesce(v_branch, public.default_branch_id(new.salon_id));
  end if;

  if new.branch_id is null then
    raise exception 'Everyone except the owner belongs to one branch';
  end if;

  -- A login and the roster entry it is attached to are one person at one branch.
  if new.team_member_id is not null
     and public.staff_branch_id(new.team_member_id) is distinct from new.branch_id then
    raise exception 'That team member works at another branch';
  end if;
  return new;
end;
$$;

create trigger profiles_branch_rules
  before insert or update on public.profiles
  for each row execute function public.profiles_branch_rules();

-- -----------------------------------------------------------------------------
-- 8. Guards that already existed, taught about branches
-- -----------------------------------------------------------------------------

-- A login's branch is the owner's to set (the service role aside).
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.salon_id is distinct from old.salon_id then
    raise exception 'A user cannot be moved between salons';
  end if;

  if new.id is distinct from old.id then
    raise exception 'Profile id is immutable';
  end if;

  if new.branch_id is distinct from old.branch_id
     and (select auth.uid()) is not null
     and not public.is_owner() then
    raise exception 'Only the owner can move a login to another branch';
  end if;

  -- Nobody changes their own role or reactivates themselves, owners included.
  if new.id = (select auth.uid()) then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your own role';
    end if;
    if new.role_id is distinct from old.role_id then
      raise exception 'You cannot change your own role';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'You cannot change your own active status';
    end if;
    if new.email is distinct from old.email then
      raise exception 'You cannot change your own email here';
    end if;
    -- The roster link decides whose earnings and commission these are. Only
    -- someone who manages the team may set it, even on their own login.
    if new.team_member_id is distinct from old.team_member_id
       and not public.has_module('team') then
      raise exception 'You cannot change which team member you are';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Row Level Security: the branch condition, added to what was already there
-- -----------------------------------------------------------------------------

-- appointments
drop policy appointments_select_permitted on public.appointments;
create policy appointments_select_permitted
  on public.appointments for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.can_access_branch(branch_id)
    and (public.has_module('calendar') or staff_id = public.current_team_member_id())
  );

drop policy appointments_insert_front_desk on public.appointments;
create policy appointments_insert_front_desk
  on public.appointments for insert to authenticated
  with check (
    salon_id = public.current_salon_id()
    and public.has_module('calendar')
    and public.can_access_branch(branch_id)
  );

drop policy appointments_update_front_desk on public.appointments;
create policy appointments_update_front_desk
  on public.appointments for update to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('calendar')
    and public.can_access_branch(branch_id)
  )
  with check (
    salon_id = public.current_salon_id()
    and public.has_module('calendar')
    and public.can_access_branch(branch_id)
  );

-- appointment_services has no branch of its own: it is reachable exactly when its
-- appointment is (that subquery is itself filtered by the policies above). The
-- read policy already works that way; the write policy now does too.
drop policy appointment_services_write_front_desk on public.appointment_services;
create policy appointment_services_write_front_desk
  on public.appointment_services for all to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('calendar')
    and exists (select 1 from public.appointments a where a.id = appointment_services.appointment_id)
  )
  with check (
    salon_id = public.current_salon_id()
    and public.has_module('calendar')
    and exists (select 1 from public.appointments a where a.id = appointment_services.appointment_id)
  );

-- receipts, their lines, and payments
drop policy receipts_select_front_desk on public.receipts;
create policy receipts_select_front_desk
  on public.receipts for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('pos')
    and public.can_access_branch(branch_id)
  );

-- A person always sees their OWN lines (their earnings), wherever they were rung up.
drop policy receipt_line_items_select_permitted on public.receipt_line_items;
create policy receipt_line_items_select_permitted
  on public.receipt_line_items for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and (
      (public.has_module('pos') and public.can_access_branch(branch_id))
      or staff_id = public.current_team_member_id()
    )
  );

drop policy payments_select_front_desk on public.payments;
create policy payments_select_front_desk
  on public.payments for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('pos')
    and public.can_access_branch(branch_id)
  );

-- A receipt's branch never changes once written.
create or replace function public.guard_receipt_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.salon_id      is distinct from old.salon_id
     or new.branch_id      is distinct from old.branch_id
     or new.receipt_number is distinct from old.receipt_number
     or new.customer_id   is distinct from old.customer_id
     or new.subtotal      is distinct from old.subtotal
     or new.discount_total is distinct from old.discount_total
     or new.loyalty_redeemed is distinct from old.loyalty_redeemed
     or new.total         is distinct from old.total
     or new.loyalty_earned is distinct from old.loyalty_earned
     or new.loyalty_earn_rate is distinct from old.loyalty_earn_rate
     or new.payment_method is distinct from old.payment_method
     or new.cash_amount   is distinct from old.cash_amount
     or new.card_amount   is distinct from old.card_amount
     or new.created_at    is distinct from old.created_at then
    raise exception 'A receipt cannot be altered; void it and issue a new one';
  end if;

  if old.status = 'voided' and new.status is distinct from old.status then
    raise exception 'A voided receipt cannot be reinstated';
  end if;

  return new;
end;
$$;

-- team members: everyone in the salon is listed (names), but only your own branch's
-- people can be changed by you.
drop policy team_members_write_owner_only on public.team_members;
create policy team_members_write_owner_only
  on public.team_members for all to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and public.can_manage_branch(branch_id)
  )
  with check (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and public.can_manage_branch(branch_id)
  );

-- payroll: pay for a branch's people is visible to payroll holders of that branch.
-- A pay PERIOD spans the whole salon, so it is visible only to payroll holders
-- who are not tied to a branch (the owner).
drop policy payroll_periods_select_owner_only on public.payroll_periods;
create policy payroll_periods_select_owner_only
  on public.payroll_periods for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('payroll')
    and public.current_branch_id() is null
  );

drop policy payroll_periods_delete_draft_owner_only on public.payroll_periods;
create policy payroll_periods_delete_draft_owner_only
  on public.payroll_periods for delete to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('payroll')
    and public.current_branch_id() is null
    and status = 'draft'
  );

drop policy payroll_entries_select_permitted on public.payroll_entries;
create policy payroll_entries_select_permitted
  on public.payroll_entries for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and (
      (public.has_module('payroll') and public.can_access_branch(public.staff_branch_id(staff_id)))
      or staff_id = public.current_team_member_id()
    )
  );

drop policy staff_compensation_select_self_or_owner on public.staff_compensation;
create policy staff_compensation_select_self_or_owner
  on public.staff_compensation for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and (
      (public.has_module('payroll') and public.can_access_branch(public.staff_branch_id(staff_id)))
      or staff_id = public.current_team_member_id()
    )
  );

drop policy staff_compensation_write_owner_only on public.staff_compensation;
create policy staff_compensation_write_owner_only
  on public.staff_compensation for all to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('payroll')
    and public.can_manage_branch(public.staff_branch_id(staff_id))
  )
  with check (
    salon_id = public.current_salon_id()
    and public.has_module('payroll')
    and public.can_manage_branch(public.staff_branch_id(staff_id))
  );

-- profiles and invitations: someone who manages the team manages their OWN branch's
-- logins and invitations. (Without this a branch manager could invite a login into
-- another branch, or change anyone's account, including the owner's.)
drop policy profiles_update_owner_manages_tenant on public.profiles;
create policy profiles_update_owner_manages_tenant
  on public.profiles for update to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and public.can_manage_branch(branch_id)
  )
  with check (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and public.can_manage_branch(branch_id)
  );

drop policy invitations_select_owner_only on public.invitations;
create policy invitations_select_owner_only
  on public.invitations for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and (branch_id is null or public.can_manage_branch(branch_id))
  );

drop policy invitations_insert_owner_only on public.invitations;
create policy invitations_insert_owner_only
  on public.invitations for insert to authenticated
  with check (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and public.can_manage_branch(branch_id)
  );

drop policy invitations_update_owner_only on public.invitations;
create policy invitations_update_owner_only
  on public.invitations for update to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and (branch_id is null or public.can_manage_branch(branch_id))
  )
  with check (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and (branch_id is null or public.can_manage_branch(branch_id))
  );

drop policy invitations_delete_owner_only on public.invitations;
create policy invitations_delete_owner_only
  on public.invitations for delete to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.has_module('team')
    and (branch_id is null or public.can_manage_branch(branch_id))
  );

-- Colleagues: a login tied to a branch sees the people of its own branch, and the
-- owner (who has no branch), not the other branches' names, emails and phone
-- numbers. The owner sees everyone. Team members follow the same rule.
drop policy profiles_select_own_tenant on public.profiles;
create policy profiles_select_own_tenant
  on public.profiles for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and (branch_id is null or public.can_manage_branch(branch_id))
  );

drop policy team_members_select_own_salon on public.team_members;
create policy team_members_select_own_salon
  on public.team_members for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.can_manage_branch(branch_id)
  );

-- record_payment runs with the owner's rights, so it checks the branch itself (a copy of
-- the existing function with that one check added).
CREATE OR REPLACE FUNCTION public.record_payment(p_appointment_id uuid, p_amount numeric, p_method payment_entry_method, p_paid_at timestamp with time zone, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_salon_id   uuid := public.current_salon_id();
  v_role       public.user_role := public.current_app_role();
  v_actor      uuid := (select auth.uid());
  v_appt       public.appointments%rowtype;
  v_amount     numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_paid       numeric(12, 2);
  v_due        numeric(12, 2);
  v_payment_id uuid;
  v_when       timestamptz := coalesce(p_paid_at, now());
begin
  if v_salon_id is null then
    raise exception 'You are not signed in to a salon';
  end if;
  if v_role not in ('owner', 'receptionist') then
    raise exception 'Only an owner or receptionist can take a payment';
  end if;
  if v_amount <= 0 then
    raise exception 'A payment has to be more than zero';
  end if;

  select * into v_appt
  from public.appointments a
  where a.id = p_appointment_id and a.salon_id = v_salon_id;

  if not found then
    raise exception 'That appointment could not be found';
  end if;

  -- This function runs with the owner's rights, so the branch rule is applied here
  -- by hand: a login tied to one branch may not take money against another's visit
  -- (and is not told what that visit has paid).
  perform public.assert_branch_access(v_appt.branch_id, 'That appointment');

  if v_appt.status in ('cancelled', 'no_show') then
    raise exception 'That appointment was % -- refund the deposit instead of adding to it',
      v_appt.status;
  end if;

  -- One payment at a time per appointment, so two receptionists taking a
  -- deposit at once cannot between them exceed the balance.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_appointment_id::text, 2)
  );

  select ab.amount_paid, ab.amount_due into v_paid, v_due
  from public.appointment_balance(p_appointment_id) ab;

  if v_paid + v_amount > v_due then
    raise exception 'That would take the total paid to % against a bill of %',
      to_char(v_paid + v_amount, 'FM999999990.00'), to_char(v_due, 'FM999999990.00');
  end if;

  insert into public.payments
    (salon_id, customer_id, appointment_id, receipt_id, kind, method,
     amount, paid_at, note, recorded_by)
  values
    (v_salon_id, v_appt.customer_id, p_appointment_id, null, 'deposit', p_method,
     v_amount, v_when, coalesce(p_note, ''), v_actor)
  returning id into v_payment_id;

  insert into public.audit_logs
    (salon_id, actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_salon_id, v_actor, v_role, 'payment.recorded', 'payment', v_payment_id::text,
    jsonb_build_object(
      'appointment_id', p_appointment_id, 'customer_id', v_appt.customer_id,
      'amount', v_amount, 'method', p_method, 'paid_at', v_when
    )
  );

  return v_payment_id;
end;
$function$;

-- Payroll runs and payment are whole-salon actions: patched copies of the existing functions.
CREATE OR REPLACE FUNCTION public.generate_payroll_period(p_starts_on date, p_ends_on date, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_salon_id   uuid := public.current_salon_id();
  v_actor      uuid := (select auth.uid());
  v_timezone   text;
  v_period_id  uuid := gen_random_uuid();
  v_revenue    numeric(12, 2);
  v_commission numeric(12, 2);
begin
  if v_salon_id is null then
    raise exception 'You are not signed in to a salon';
  end if;
  if not public.has_module('payroll') then
    raise exception 'Your role does not include payroll';
  end if;
  -- Payroll covers the whole salon, so a login tied to one branch may not run it.
  if public.current_branch_id() is not null then
    raise exception 'Payroll covers the whole salon, so only the owner can do this';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'The end date cannot be before the start date';
  end if;

  select s.timezone into v_timezone from public.salons s where s.id = v_salon_id;
  v_timezone := coalesce(v_timezone, 'UTC');

  insert into public.payroll_periods
    (id, salon_id, starts_on, ends_on, notes, created_by)
  values
    (v_period_id, v_salon_id, p_starts_on, p_ends_on, coalesce(p_notes, ''), v_actor);

  insert into public.payroll_entries (
    salon_id, period_id, staff_id, staff_name,
    services_performed, revenue,
    commission_type, commission_basis, commission_rate, fixed_amount,
    salary_amount, salary_days_paid,
    salary_pay, commission_pay, commission_amount,
    period_starts_on, period_ends_on, status
  )
  with work as (
    select
      li.staff_id,
      sum(li.quantity)::integer as services_performed,
      round(sum(li.line_total), 2) as revenue,
      round(sum(
        public.line_commission(
          li.line_total, li.quantity,
          sc.commission_basis, sc.commission_rate, sc.fixed_amount,
          svc.commission_basis, svc.commission_rate, svc.commission_fixed
        )
      ), 2) as commission
    from public.receipt_line_items li
    join public.receipts r on r.id = li.receipt_id
    left join public.services svc
      on svc.id = li.service_id and svc.salon_id = v_salon_id
    left join public.staff_compensation sc
      on sc.staff_id = li.staff_id and sc.salon_id = v_salon_id
    where li.salon_id = v_salon_id
      and li.staff_id is not null
      and r.status = 'issued'
      and (li.performed_at at time zone v_timezone)::date between p_starts_on and p_ends_on
    group by li.staff_id
  ),
  people as (
    select tm.id as staff_id, tm.full_name as staff_name
    from public.team_members tm
    where tm.salon_id = v_salon_id
      and (
        exists (select 1 from work w where w.staff_id = tm.id)
        or (
          tm.is_active
          and exists (
            select 1 from public.staff_compensation sc
            where sc.staff_id = tm.id
              and sc.salon_id = v_salon_id
              and coalesce(sc.salary_amount, 0) > 0
          )
        )
      )
  )
  select
    v_salon_id,
    v_period_id,
    people.staff_id,
    people.staff_name,
    coalesce(work.services_performed, 0),
    coalesce(work.revenue, 0),
    case
      when coalesce(sc.salary_amount, 0) > 0 then 'fixed_salary'::public.commission_type
      when sc.commission_basis = 'fixed_per_service' then 'fixed_per_service'::public.commission_type
      else 'percentage'::public.commission_type
    end,
    sc.commission_basis,
    coalesce(sc.commission_rate, 0),
    coalesce(sc.fixed_amount, 0),
    coalesce(sc.salary_amount, 0),
    case
      when coalesce(sc.salary_amount, 0) > 0
        then public.payable_days(p_starts_on, p_ends_on, sc.joining_date)
      else 0
    end,
    case
      when coalesce(sc.salary_amount, 0) > 0
        then public.prorated_salary(sc.salary_amount, p_starts_on, p_ends_on, sc.joining_date)
      else 0
    end,
    coalesce(work.commission, 0),
    round(
      case
        when coalesce(sc.salary_amount, 0) > 0
          then public.prorated_salary(sc.salary_amount, p_starts_on, p_ends_on, sc.joining_date)
        else 0
      end
      + coalesce(work.commission, 0),
      2
    ),
    p_starts_on,
    p_ends_on,
    'draft'
  from people
  left join work on work.staff_id = people.staff_id
  left join public.staff_compensation sc
    on sc.staff_id = people.staff_id and sc.salon_id = v_salon_id;

  select coalesce(sum(e.revenue), 0), coalesce(sum(e.commission_amount), 0)
  into v_revenue, v_commission
  from public.payroll_entries e where e.period_id = v_period_id;

  update public.payroll_periods
  set total_revenue = v_revenue, total_commission = v_commission
  where id = v_period_id;

  insert into public.audit_logs
    (salon_id, actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_salon_id, v_actor, 'owner', 'payroll.generated', 'payroll_period', v_period_id::text,
    jsonb_build_object(
      'starts_on', p_starts_on, 'ends_on', p_ends_on,
      'total_revenue', v_revenue, 'total_commission', v_commission
    )
  );

  return v_period_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_payroll_paid(p_period_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_salon_id uuid := public.current_salon_id();
  v_actor    uuid := (select auth.uid());
  v_period   public.payroll_periods%rowtype;
  v_now      timestamptz := now();
begin
  if v_salon_id is null then
    raise exception 'You are not signed in to a salon';
  end if;
  if not public.has_module('payroll') then
    raise exception 'Your role does not include payroll';
  end if;
  -- Payroll covers the whole salon, so a login tied to one branch may not run it.
  if public.current_branch_id() is not null then
    raise exception 'Payroll covers the whole salon, so only the owner can do this';
  end if;

  select * into v_period
  from public.payroll_periods pp
  where pp.id = p_period_id and pp.salon_id = v_salon_id
  for update;

  if not found then
    raise exception 'That payroll period could not be found';
  end if;
  if v_period.status = 'paid' then
    raise exception 'That period is already marked paid';
  end if;

  update public.payroll_periods
  set status = 'paid', paid_at = v_now, paid_by = v_actor
  where id = p_period_id;

  update public.payroll_entries
  set status = 'paid', paid_at = v_now
  where period_id = p_period_id;

  insert into public.audit_logs
    (salon_id, actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_salon_id, v_actor, 'owner', 'payroll.marked_paid', 'payroll_period', p_period_id::text,
    jsonb_build_object(
      'starts_on', v_period.starts_on, 'ends_on', v_period.ends_on,
      'total_commission', v_period.total_commission
    )
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 10. The owner's consolidated view
--
-- One row per branch, then a "All branches" total, for a date range counted in
-- the salon's own timezone. Revenue is what the Reports page calls revenue
-- (issued receipts, voided ones excluded). Staff pay is the commission and salary
-- in payroll for that branch's people, from pay periods that END in the range
-- (draft or paid): there are no other costs recorded in this product, so
-- "profit" here means revenue after staff pay, before rent, stock and the like.
--
-- SECURITY DEFINER, on purpose and unlike the other reports: it must show every
-- branch even while the owner has one chosen in the top bar, which would narrow a
-- SECURITY INVOKER report. It refuses anyone who is not the owner, and reads only
-- the caller's own salon.
-- -----------------------------------------------------------------------------
create or replace function public.report_branch_overview(p_from date, p_to date)
returns table (
  branch_id     uuid,
  branch_name   text,
  is_active     boolean,
  receipt_count bigint,
  revenue       numeric,
  discounts     numeric,
  staff_pay     numeric,
  profit        numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_salon uuid := public.current_salon_id();
  v_tz    text;
begin
  if v_salon is null then
    raise exception 'You are not signed in to a salon';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner can compare branches';
  end if;

  select coalesce(s.timezone, 'UTC') into v_tz from public.salons s where s.id = v_salon;

  return query
  with sales as (
    select r.branch_id as b, count(*)::bigint as n,
           round(sum(r.total), 2) as revenue, round(sum(r.discount_total), 2) as discounts
    from public.receipts r
    where r.salon_id = v_salon and r.status = 'issued'
      and (r.created_at at time zone v_tz)::date between p_from and p_to
    group by r.branch_id
  ),
  pay as (
    select tm.branch_id as b, round(sum(e.commission_amount), 2) as pay
    from public.payroll_entries e
    join public.team_members tm on tm.id = e.staff_id and tm.salon_id = e.salon_id
    where e.salon_id = v_salon and e.period_ends_on between p_from and p_to
    group by tm.branch_id
  ),
  per_branch as (
    select br.id, br.name, br.is_active, br.created_at,
           coalesce(s.n, 0) as n, coalesce(s.revenue, 0) as revenue,
           coalesce(s.discounts, 0) as discounts, coalesce(p.pay, 0) as pay
    from public.branches br
    left join sales s on s.b = br.id
    left join pay p on p.b = br.id
    where br.salon_id = v_salon
  )
  select u.id, u.name, u.is_active, u.n, u.revenue, u.discounts, u.pay, round(u.revenue - u.pay, 2)
  from (
    select pb.id, pb.name, pb.is_active, pb.n, pb.revenue, pb.discounts, pb.pay, 0 as sort_key, pb.created_at as sort_at
    from per_branch pb
    union all
    select null::uuid, 'All branches', true,
           coalesce(sum(pb.n), 0)::bigint, coalesce(sum(pb.revenue), 0),
           coalesce(sum(pb.discounts), 0), coalesce(sum(pb.pay), 0), 1, now()
    from per_branch pb
  ) u
  order by u.sort_key, u.sort_at, u.name;
end;
$$;

revoke execute on function public.report_branch_overview(date, date) from public;
grant execute on function public.report_branch_overview(date, date) to authenticated, service_role;

-- The helpers are for the policies and triggers; nothing outside needs to call them
-- except through them, but the signed-in role must be able to evaluate a policy.
grant execute on function public.active_branch_filter() to authenticated, service_role;
grant execute on function public.current_branch_id() to authenticated, service_role;
grant execute on function public.can_access_branch(uuid) to authenticated, service_role;
grant execute on function public.staff_branch_id(uuid) to authenticated, service_role;
grant execute on function public.can_manage_branch(uuid) to authenticated, service_role;
revoke execute on function public.assert_branch_manage(uuid, text) from public;
grant execute on function public.default_branch_id(uuid) to authenticated, service_role;
revoke execute on function public.resolve_new_row_branch(uuid) from public;
revoke execute on function public.assert_branch_open(uuid) from public;
revoke execute on function public.assert_branch_access(uuid, text) from public;
revoke execute on function public.create_default_branch() from public;


-- -----------------------------------------------------------------------------
-- 11. Signup: an invited person's roster entry is placed at the branch their
--     invitation names (copy of the existing function with that one change)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_invite    public.invitations%rowtype;
  v_salon_id  uuid;
  v_role      public.user_role;
  v_full_name text;
  v_action    text;
  v_member_id uuid;
  v_role_id   uuid;
  v_invited   boolean := false;
begin
  select * into v_invite
  from public.invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if found then
    v_salon_id  := v_invite.salon_id;
    v_role      := v_invite.role;
    v_full_name := coalesce(nullif(v_meta ->> 'full_name', ''), v_invite.full_name, '');
    v_action    := 'staff.invite_accepted';
    v_invited   := true;

    update public.invitations
    set status = 'accepted', accepted_at = now(), accepted_user_id = new.id
    where id = v_invite.id;

  elsif coalesce(nullif(btrim(v_meta ->> 'salon_name'), ''), '') <> '' then
    v_role      := 'owner';
    v_full_name := coalesce(v_meta ->> 'full_name', '');
    v_action    := 'salon.created';

    insert into public.salons (name, business_type, country, timezone, currency)
    values (
      btrim(v_meta ->> 'salon_name'),
      coalesce((nullif(v_meta ->> 'business_type', ''))::public.business_type, 'salon'),
      coalesce(nullif(v_meta ->> 'country', ''), 'US'),
      coalesce(nullif(v_meta ->> 'timezone', ''), 'UTC'),
      coalesce(nullif(v_meta ->> 'currency', ''), 'USD')
    )
    returning id into v_salon_id;

    insert into public.salon_settings (salon_id) values (v_salon_id);

    -- Before the profile: the owner needs a role to hold any module at all.
    perform public.seed_default_roles(v_salon_id);

  else
    raise exception
      'No salon context for %: sign up with salon details or use an invitation link', new.email
      using errcode = 'check_violation';
  end if;

  -- ---- which role ----------------------------------------------------------
  if not v_invited then
    -- The salon's owner takes the owner role. It is never assignable, so this
    -- is the only place it is ever handed out.
    select r.id into v_role_id
    from public.roles r where r.salon_id = v_salon_id and r.is_owner;

  elsif v_invite.role_id is not null then
    v_role_id := v_invite.role_id;

  else
    -- An older invitation that named only the legacy enum. Match it to the
    -- built-in of the same meaning rather than leaving them role-less.
    select r.id into v_role_id
    from public.roles r
    where r.salon_id = v_salon_id
      and r.name = case v_role
                     when 'receptionist' then 'Receptionist'
                     else 'Staff / Therapist'
                   end;
  end if;

  -- ---- which roster entry, if any -----------------------------------------
  if v_invited and v_invite.team_member_id is not null then
    if exists (
      select 1 from public.profiles p where p.team_member_id = v_invite.team_member_id
    ) then
      raise exception 'That team member already has a login'
        using errcode = 'unique_violation';
    end if;
    v_member_id := v_invite.team_member_id;

  elsif (not v_invited) or v_invite.create_roster_entry then
    insert into public.team_members (salon_id, full_name, branch_id)
    values (
      v_salon_id,
      coalesce(nullif(btrim(v_full_name), ''), split_part(new.email, '@', 1)),
      -- An invited person works where their invitation says; anyone else (a new
      -- salon's owner) lands in the Main Branch.
      case when v_invited then v_invite.branch_id end
    )
    returning id into v_member_id;
  end if;

  insert into public.profiles (id, salon_id, role, full_name, email, team_member_id, role_id)
  values (new.id, v_salon_id, v_role, v_full_name, new.email, v_member_id, v_role_id);

  insert into public.audit_logs (
    salon_id, actor_id, actor_email, actor_role, action, entity_type, entity_id, metadata
  )
  values (
    v_salon_id, new.id, new.email, v_role, v_action, 'profile', new.id::text,
    jsonb_build_object(
      'role', v_role,
      'via', case when v_action = 'salon.created' then 'signup' else 'invitation' end,
      'team_member_id', v_member_id,
      'role_id', v_role_id
    )
  );

  return new;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 12. Moving people between branches
--
-- Owner only, and one step: a login and its roster entry move together (they are
-- one person), which two separate updates from the application could not do
-- atomically. Refused while the person still has upcoming appointments at the old
-- branch, so nobody is left booked at a branch they no longer work at; their
-- PAST appointments, sales and pay stay exactly where they happened.
-- -----------------------------------------------------------------------------
create or replace function public.move_team_member_to_branch(p_member_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon  uuid := public.current_salon_id();
  v_member public.team_members%rowtype;
begin
  if v_salon is null then
    raise exception 'You are not signed in to a salon';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner can move a team member to another branch';
  end if;

  select * into v_member from public.team_members tm
  where tm.id = p_member_id and tm.salon_id = v_salon;
  if not found then
    raise exception 'That team member could not be found';
  end if;

  if not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.salon_id = v_salon and b.is_active
  ) then
    raise exception 'Choose an open branch';
  end if;

  if v_member.branch_id = p_branch_id then
    return;
  end if;

  if exists (
    select 1 from public.appointments a
    where a.staff_id = p_member_id
      and a.status in ('booked', 'confirmed')
      and a.ends_at > now()
  ) then
    raise exception 'They still have upcoming appointments at their current branch. Complete, cancel or reassign those first.';
  end if;

  update public.team_members set branch_id = p_branch_id where id = p_member_id;

  -- Their login, if they have one, moves with them (and is checked against the
  -- member's branch by profiles_branch_rules, so the order matters).
  update public.profiles set branch_id = p_branch_id
  where team_member_id = p_member_id and salon_id = v_salon
    and not exists (
      select 1 from public.roles r where r.id = profiles.role_id and r.is_owner
    );
end;
$$;

-- A login with no roster entry (an accountant, say) has only its own branch to move.
create or replace function public.move_login_to_branch(p_profile_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon   uuid := public.current_salon_id();
  v_profile public.profiles%rowtype;
begin
  if v_salon is null then
    raise exception 'You are not signed in to a salon';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner can move a login to another branch';
  end if;

  select * into v_profile from public.profiles p where p.id = p_profile_id and p.salon_id = v_salon;
  if not found then
    raise exception 'That login could not be found';
  end if;
  if v_profile.branch_id is null then
    raise exception 'The owner works at every branch';
  end if;

  if v_profile.team_member_id is not null then
    perform public.move_team_member_to_branch(v_profile.team_member_id, p_branch_id);
    return;
  end if;

  if not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.salon_id = v_salon and b.is_active
  ) then
    raise exception 'Choose an open branch';
  end if;
  update public.profiles set branch_id = p_branch_id where id = p_profile_id;
end;
$$;

revoke execute on function public.move_team_member_to_branch(uuid, uuid) from public;
revoke execute on function public.move_login_to_branch(uuid, uuid) from public;
grant execute on function public.move_team_member_to_branch(uuid, uuid) to authenticated, service_role;
grant execute on function public.move_login_to_branch(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
