-- =============================================================================
-- Support / assistant staff on an appointment
--
-- An appointment has ONE lead (appointments.staff_id, unchanged) and up to TWO
-- support staff (this table). Keeping the lead where it is means the exclusion
-- constraint `appointments_no_double_booking` still protects the lead's time
-- exactly as before, and support staff are simply not in it: a support person
-- who is busy elsewhere never blocks a booking.
--
--   * Only the lead can conflict. A support row is never part of any overlap check.
--   * At most 2 support staff, none of them the lead, all at the appointment's
--     branch and active when added.
--   * The team is fixed once a visit has an ISSUED receipt: payroll reads it, and
--     changing who assisted afterwards would silently rewrite pay. Void the
--     receipt first.
--   * Commission follows the receipt (CLAUDE.md rule 15): a support person earns
--     on the receipt lines of the appointments they assisted, at their own rate,
--     on top of the lead (generate_payroll_period below). Their share is not
--     counted as revenue.
--
-- Rule 1/8: its own salon_id (cascade), composite foreign keys, RLS.
-- Written only through set_appointment_support(), which checks the same module
-- and branch rules as booking.
-- =============================================================================

create table public.appointment_staff (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons (id) on delete cascade,
  branch_id      uuid not null,
  appointment_id uuid not null,
  staff_id       uuid not null,
  sort_order     smallint not null default 0,
  created_at     timestamptz not null default now(),

  unique (appointment_id, staff_id),
  foreign key (appointment_id, salon_id)
    references public.appointments (id, salon_id) on delete cascade,
  foreign key (staff_id, salon_id)
    references public.team_members (id, salon_id) on delete no action,
  foreign key (branch_id, salon_id)
    references public.branches (id, salon_id) on delete no action
);

create index appointment_staff_appointment_idx on public.appointment_staff (appointment_id);
create index appointment_staff_staff_idx on public.appointment_staff (staff_id);

comment on table public.appointment_staff is
  'Support / assistant staff on an appointment. The lead is appointments.staff_id; support never conflicts.';

alter table public.appointment_staff enable row level security;

-- Who can read it: whoever can read the appointment, plus the support person.
create policy appointment_staff_select_permitted
  on public.appointment_staff for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.can_access_branch(branch_id)
    and (public.has_module('calendar') or public.has_module('pos')
         or staff_id = public.current_team_member_id())
  );
-- No insert / update / delete policy: set_appointment_support() is the way in.

-- Rules on every row: branch from the appointment, not the lead, max two, active.
create or replace function public.appointment_staff_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt   public.appointments%rowtype;
  v_member public.team_members%rowtype;
begin
  select * into v_appt from public.appointments
  where id = new.appointment_id and salon_id = new.salon_id;
  if not found then
    raise exception 'That appointment could not be found';
  end if;

  select * into v_member from public.team_members
  where id = new.staff_id and salon_id = new.salon_id;
  if not found then
    raise exception 'That team member could not be found';
  end if;

  if new.staff_id = v_appt.staff_id then
    raise exception '% is already the lead on this appointment', v_member.full_name;
  end if;
  if not v_member.is_active then
    raise exception '% is not active', v_member.full_name;
  end if;
  if v_member.branch_id <> v_appt.branch_id then
    raise exception '% works at another branch, so cannot assist on this appointment', v_member.full_name;
  end if;
  if (select count(*) from public.appointment_staff s
      where s.appointment_id = new.appointment_id and s.id is distinct from new.id) >= 2 then
    raise exception 'An appointment can have at most 2 support staff besides the lead';
  end if;

  new.branch_id := v_appt.branch_id;
  return new;
end;
$$;

create trigger appointment_staff_guard
  before insert or update on public.appointment_staff
  for each row execute function public.appointment_staff_guard();

-- The team is fixed once the visit has an issued receipt (payroll reads it).
create or replace function public.appointment_staff_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment uuid := coalesce(new.appointment_id, old.appointment_id);
begin
  if exists (
    select 1 from public.receipts r
    where r.appointment_id = v_appointment and r.status = 'issued'
  ) then
    raise exception 'This visit has been invoiced, so its team can no longer change. Void the receipt first.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger appointment_staff_lock
  before insert or update or delete on public.appointment_staff
  for each row execute function public.appointment_staff_lock();

-- If the lead is changed (a reschedule to another therapist) to someone who was
-- a support person, they stop being support: one person, one role.
create or replace function public.appointments_drop_lead_from_support()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.appointment_staff
  where appointment_id = new.id and staff_id = new.staff_id;
  return new;
end;
$$;

create trigger appointments_drop_lead_from_support
  after update of staff_id on public.appointments
  for each row when (new.staff_id is distinct from old.staff_id)
  execute function public.appointments_drop_lead_from_support();

-- -----------------------------------------------------------------------------
-- set_appointment_support(appointment, support staff ids)
--
-- Replaces the appointment's support team. Anyone who may edit the appointment
-- (the calendar module, at a branch they can reach) may do this. The order of the
-- ids is kept. Duplicates and the lead are refused by the guard above.
-- -----------------------------------------------------------------------------
create or replace function public.set_appointment_support(
  p_appointment_id uuid,
  p_support_ids    uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon uuid := public.current_salon_id();
  v_appt  public.appointments%rowtype;
  v_ids   uuid[] := coalesce(p_support_ids, '{}');
  v_id    uuid;
  v_i     smallint := 0;
begin
  if v_salon is null then
    raise exception 'You are not signed in to a salon';
  end if;
  if not public.has_module('calendar') then
    raise exception 'Your role does not include the calendar';
  end if;

  select * into v_appt from public.appointments
  where id = p_appointment_id and salon_id = v_salon;
  if not found or not public.can_access_branch(v_appt.branch_id) then
    raise exception 'That appointment could not be found';
  end if;

  if cardinality(v_ids) > 2 then
    raise exception 'An appointment can have at most 2 support staff besides the lead';
  end if;

  delete from public.appointment_staff where appointment_id = p_appointment_id;

  foreach v_id in array v_ids loop
    insert into public.appointment_staff (salon_id, branch_id, appointment_id, staff_id, sort_order)
    values (v_salon, v_appt.branch_id, p_appointment_id, v_id, v_i);
    v_i := v_i + 1;
  end loop;
end;
$$;

revoke execute on function public.set_appointment_support(uuid, uuid[]) from public;
grant execute on function public.set_appointment_support(uuid, uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Payroll: support staff earn commission on the lines of appointments they assisted.
-- (generate_payroll_period as in the branches migration, plus support_work.)
-- -----------------------------------------------------------------------------
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
  with lead_work as (
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
  -- Support / assistant staff on the same appointments earn commission on those
  -- lines too, at their own rate and on top of the lead's. Their share is NOT
  -- counted as revenue, so a period's total_revenue stays the salon's takings.
  support_work as (
    select
      ast.staff_id,
      sum(li.quantity)::integer as services_performed,
      0::numeric as revenue,
      round(sum(
        public.line_commission(
          li.line_total, li.quantity,
          sc.commission_basis, sc.commission_rate, sc.fixed_amount,
          svc.commission_basis, svc.commission_rate, svc.commission_fixed
        )
      ), 2) as commission
    from public.receipt_line_items li
    join public.receipts r on r.id = li.receipt_id and r.salon_id = li.salon_id
    join public.appointment_staff ast
      on ast.appointment_id = r.appointment_id and ast.salon_id = r.salon_id
    left join public.services svc
      on svc.id = li.service_id and svc.salon_id = v_salon_id
    left join public.staff_compensation sc
      on sc.staff_id = ast.staff_id and sc.salon_id = v_salon_id
    where li.salon_id = v_salon_id
      and r.status = 'issued'
      and (li.performed_at at time zone v_timezone)::date between p_starts_on and p_ends_on
    group by ast.staff_id
  ),
  work as (
    select u.staff_id,
           sum(u.services_performed)::integer as services_performed,
           sum(u.revenue) as revenue,
           round(sum(u.commission), 2) as commission
    from (
      select staff_id, services_performed, revenue, commission from lead_work
      union all
      select staff_id, services_performed, revenue, commission from support_work
    ) u
    group by u.staff_id
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
