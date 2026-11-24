-- Support / assistant staff on POS service lines.
--
-- Appointment support is stored separately from its lead and never participates
-- in the appointment overlap constraint. Receipt-line support follows the same
-- model, so a walk-in sale can name up to two assistants per service without
-- changing the immutable receipt-line ledger or any pricing calculation.

alter table public.receipt_line_items
  add constraint receipt_line_items_id_salon_key unique (id, salon_id);

create table public.receipt_line_support_staff (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid not null references public.salons (id) on delete cascade,
  branch_id             uuid not null,
  receipt_line_item_id  uuid not null,
  support_staff_1_id    uuid,
  support_staff_2_id    uuid,
  created_at            timestamptz not null default now(),

  unique (receipt_line_item_id, salon_id),
  foreign key (receipt_line_item_id, salon_id)
    references public.receipt_line_items (id, salon_id) on delete cascade,
  foreign key (support_staff_1_id, salon_id)
    references public.team_members (id, salon_id) on delete no action,
  foreign key (support_staff_2_id, salon_id)
    references public.team_members (id, salon_id) on delete no action,
  foreign key (branch_id, salon_id)
    references public.branches (id, salon_id) on delete no action
);

create index receipt_line_support_staff_member_idx
  on public.receipt_line_support_staff (support_staff_1_id, created_at desc)
  where support_staff_1_id is not null;
create index receipt_line_support_staff_member_2_idx
  on public.receipt_line_support_staff (support_staff_2_id, created_at desc)
  where support_staff_2_id is not null;

alter table public.receipt_line_support_staff enable row level security;

create policy receipt_line_support_staff_select_permitted
  on public.receipt_line_support_staff for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and (
      ((select public.has_module('pos')) and public.can_access_branch(branch_id))
      or support_staff_1_id = (select public.current_team_member_id())
      or support_staff_2_id = (select public.current_team_member_id())
    )
  );
-- No write policies: receipt support can only be recorded during checkout.

create or replace function public.receipt_line_support_staff_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line   public.receipt_line_items%rowtype;
  v_member public.team_members%rowtype;
  v_staff_id uuid;
begin
  select * into v_line
  from public.receipt_line_items li
  where li.id = new.receipt_line_item_id and li.salon_id = new.salon_id;

  if not found then
    raise exception 'That receipt line could not be found';
  end if;
  if v_line.item_type <> 'service' then
    raise exception 'Retail products cannot have support staff';
  end if;
  if (new.support_staff_1_id is not null and new.support_staff_1_id = v_line.staff_id)
     or (new.support_staff_2_id is not null and new.support_staff_2_id = v_line.staff_id) then
    raise exception 'The Primary Lead cannot also be support';
  end if;
  if new.support_staff_1_id is not null
     and new.support_staff_1_id = new.support_staff_2_id then
    raise exception 'Choose each support person once';
  end if;

  foreach v_staff_id in array array[new.support_staff_1_id, new.support_staff_2_id] loop
    if v_staff_id is null then
      continue;
    end if;
    select * into v_member
    from public.team_members tm
    where tm.id = v_staff_id and tm.salon_id = new.salon_id;
    if not found then
      raise exception 'A support person is not on this salon''s roster';
    end if;
    if not v_member.is_active then
      raise exception 'A support person on this receipt is no longer active';
    end if;
    if v_member.branch_id <> v_line.branch_id then
      raise exception 'A support person works at another branch';
    end if;
  end loop;

  new.branch_id := v_line.branch_id;
  return new;
end;
$$;

create trigger receipt_line_support_staff_guard
  before insert or update on public.receipt_line_support_staff
  for each row execute function public.receipt_line_support_staff_guard();

-- This wrapper keeps create_receipt() as the sole authority for prices, stock,
-- discounts, payments and loyalty. It adds only the non-monetary team data that
-- create_receipt() deliberately does not know about.
create or replace function public.create_receipt_with_support(
  p_customer_id        uuid,
  p_payment_method     public.payment_method,
  p_cash_amount        numeric,
  p_card_amount        numeric,
  p_loyalty_redeem     numeric,
  p_deal_id            uuid,
  p_notes              text,
  p_lines              jsonb,
  p_new_customer_name  text default null,
  p_new_customer_phone text default null,
  p_appointment_id     uuid default null,
  p_transfer_amount    numeric default 0,
  p_manual_discount_type   text default null,
  p_manual_discount_value  numeric default null,
  p_manual_discount_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_input      record;
  v_line_id    uuid;
begin
  v_receipt_id := public.create_receipt(
    p_customer_id,
    p_payment_method,
    p_cash_amount,
    p_card_amount,
    p_loyalty_redeem,
    p_deal_id,
    p_notes,
    p_lines,
    p_new_customer_name,
    p_new_customer_phone,
    p_appointment_id,
    p_transfer_amount,
    p_manual_discount_type,
    p_manual_discount_value,
    p_manual_discount_reason
  );

  for v_input in
    select item.value as line, item.ordinality::integer - 1 as sort_order
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
      with ordinality as item(value, ordinality)
  loop
    if v_input.line ->> 'product_id' is not null then
      continue;
    end if;

    select li.id into v_line_id
    from public.receipt_line_items li
    where li.receipt_id = v_receipt_id
      and li.sort_order = v_input.sort_order
      and li.item_type = 'service';

    if not found then
      raise exception 'A service line could not be matched to its receipt';
    end if;

    insert into public.receipt_line_support_staff (
      salon_id, branch_id, receipt_line_item_id, support_staff_1_id, support_staff_2_id
    )
    select
      li.salon_id,
      li.branch_id,
      li.id,
      nullif(v_input.line ->> 'support_staff_1_id', '')::uuid,
      nullif(v_input.line ->> 'support_staff_2_id', '')::uuid
    from public.receipt_line_items li
    where li.id = v_line_id;
  end loop;

  return v_receipt_id;
end;
$$;

revoke execute on function public.create_receipt_with_support(
  uuid, public.payment_method, numeric, numeric, numeric, uuid, text, jsonb,
  text, text, uuid, numeric, text, numeric, text
) from public;
grant execute on function public.create_receipt_with_support(
  uuid, public.payment_method, numeric, numeric, numeric, uuid, text, jsonb,
  text, text, uuid, numeric, text, numeric, text
) to authenticated, service_role;

-- Payroll pays each explicit receipt-line assistant once, with the old
-- appointment-level association as a fallback for receipts issued before this
-- migration. Support pay never adds to revenue.
create or replace function public.generate_payroll_period(
  p_starts_on date,
  p_ends_on date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
      and li.item_type = 'service'
      and r.status = 'issued'
      and (li.performed_at at time zone v_timezone)::date between p_starts_on and p_ends_on
    group by li.staff_id
  ),
  support_assignments as (
    select
      li.id as line_id,
      li.salon_id,
      assigned.support_staff_1_id as staff_id
    from public.receipt_line_items li
    join public.receipt_line_support_staff assigned
      on assigned.receipt_line_item_id = li.id and assigned.salon_id = li.salon_id
    where li.item_type = 'service'
      and assigned.support_staff_1_id is not null

    union all

    select
      li.id as line_id,
      li.salon_id,
      assigned.support_staff_2_id as staff_id
    from public.receipt_line_items li
    join public.receipt_line_support_staff assigned
      on assigned.receipt_line_item_id = li.id and assigned.salon_id = li.salon_id
    where li.item_type = 'service'
      and assigned.support_staff_2_id is not null

    union all

    select
      li.id as line_id,
      li.salon_id,
      ast.staff_id
    from public.receipt_line_items li
    join public.receipts r on r.id = li.receipt_id and r.salon_id = li.salon_id
    join public.appointment_staff ast
      on ast.appointment_id = r.appointment_id and ast.salon_id = r.salon_id
    where li.item_type = 'service'
      and not exists (
        select 1
        from public.receipt_line_support_staff assigned
        where assigned.receipt_line_item_id = li.id
          and assigned.salon_id = li.salon_id
      )
  ),
  support_work as (
    select
      assignment.staff_id,
      sum(li.quantity)::integer as services_performed,
      0::numeric as revenue,
      round(sum(
        public.line_commission(
          li.line_total, li.quantity,
          sc.commission_basis, sc.commission_rate, sc.fixed_amount,
          svc.commission_basis, svc.commission_rate, svc.commission_fixed
        )
      ), 2) as commission
    from support_assignments assignment
    join public.receipt_line_items li
      on li.id = assignment.line_id and li.salon_id = assignment.salon_id
    join public.receipts r on r.id = li.receipt_id and r.salon_id = li.salon_id
    left join public.services svc
      on svc.id = li.service_id and svc.salon_id = v_salon_id
    left join public.staff_compensation sc
      on sc.staff_id = assignment.staff_id and sc.salon_id = v_salon_id
    where li.salon_id = v_salon_id
      and li.item_type = 'service'
      and r.status = 'issued'
      and (li.performed_at at time zone v_timezone)::date between p_starts_on and p_ends_on
    group by assignment.staff_id
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
$$;
