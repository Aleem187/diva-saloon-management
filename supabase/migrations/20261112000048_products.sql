-- =============================================================================
-- Retail products
--
-- A catalogue of things the salon sells over the counter, next to its services:
-- name, SKU, category, price, stock and a low-stock threshold. Managed by whoever
-- holds the Services module (it is the same catalogue job), sold at the till by
-- whoever holds POS.
--
--   * A receipt line is now a 'service' or a 'product' (receipt_line_items.item_type).
--     create_receipt() accepts {"product_id", "quantity"} lines beside the service
--     lines; the price comes from here, never from the caller (CLAUDE.md rule 4).
--   * A product line has no team member, so payroll (which reads lines that have
--     one) pays no commission on it. Support-staff commission is limited to service
--     lines for the same reason.
--   * Stock is taken inside create_receipt() with a guard that refuses a sale
--     that would go below zero, and put back by void_receipt().
--   * The reports that mean "services" (by service, by staff) now say so; product
--     sales have their own report, and report_sales_split() gives the two side by
--     side with a combined total.
--   * Stock is one pool for the salon (the catalogue is shared across branches).
--
-- Rule 8: own salon_id (cascade); rule 1: RLS; a product with sales is archived,
-- never deleted (no delete policy, and the line keeps its own name and price).
-- =============================================================================

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  salon_id            uuid not null references public.salons (id) on delete cascade,
  name                text not null check (length(btrim(name)) between 1 and 160),
  sku                 text not null default '' check (length(sku) <= 64),
  category            text not null default 'General' check (length(btrim(category)) between 1 and 80),
  price               numeric(12, 2) not null check (price >= 0),
  stock_quantity      integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, salon_id)
);

create unique index products_salon_sku_key
  on public.products (salon_id, lower(sku)) where sku <> '';
create unique index products_salon_active_name_key
  on public.products (salon_id, lower(name)) where is_active;
create index products_salon_idx on public.products (salon_id, category, name);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

comment on table public.products is
  'Retail products: sold at the till as receipt lines of type product. Stock moves only through create_receipt() and void_receipt() (and the owner editing the count).';

alter table public.products enable row level security;

create policy products_select_permitted
  on public.products for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and (public.has_module('services') or public.has_module('pos'))
  );

create policy products_insert_catalogue
  on public.products for insert to authenticated
  with check (salon_id = public.current_salon_id() and public.has_module('services'));

create policy products_update_catalogue
  on public.products for update to authenticated
  using (salon_id = public.current_salon_id() and public.has_module('services'))
  with check (salon_id = public.current_salon_id() and public.has_module('services'));

-- No delete policy: archive it instead.

-- -----------------------------------------------------------------------------
-- Receipt lines: service or product
-- -----------------------------------------------------------------------------
alter table public.receipt_line_items
  add column item_type text not null default 'service'
    check (item_type in ('service', 'product')),
  add column product_id uuid;

alter table public.receipt_line_items
  add constraint receipt_line_items_product_fk
    foreign key (product_id, salon_id)
    references public.products (id, salon_id) on delete set null (product_id);

alter table public.receipt_line_items
  add constraint receipt_line_items_type_consistent
    check (
      (item_type = 'service' and product_id is null)
      or (item_type = 'product' and service_id is null and staff_id is null)
    );

create index receipt_line_items_type_idx on public.receipt_line_items (salon_id, item_type);

-- -----------------------------------------------------------------------------
-- create_receipt(): service lines and product lines
-- -----------------------------------------------------------------------------
create or replace function public.create_receipt(
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
  -- The visit this sale settles, when it came from the diary rather than the
  -- door. Supplying it links the receipt to the appointment and nets off any
  -- deposit already taken against it.
  p_appointment_id     uuid default null,
  -- Only meaningful for a split; the single-method cases derive their own.
  p_transfer_amount    numeric default 0,
  -- A discretionary discount given at the till, on top of any deal: either a
  -- percentage of what remains after the deal, or a fixed amount. A reason is
  -- required. NULL type means no discount.
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
  v_salon_id       uuid := public.current_salon_id();
  v_role           public.user_role := public.current_app_role();
  v_actor          uuid := (select auth.uid());
  v_customer_id    uuid := p_customer_id;
  v_line           jsonb;
  v_service        public.services%rowtype;
  v_product        public.products%rowtype;
  v_stock          record;
  v_staff_active   boolean;
  v_quantity       integer;
  v_gross          numeric(12, 2) := 0;
  v_discount_total numeric(12, 2) := 0;
  v_eligible_gross numeric(12, 2) := 0;
  v_deal           public.deals%rowtype;
  v_deal_services  uuid[];
  v_present        uuid[];
  v_bundle_cut     numeric(12, 2) := 0;
  v_balance        numeric(12, 2);
  v_redeem         numeric(12, 2);
  v_bill           numeric(12, 2);
  v_total          numeric(12, 2);
  v_rate           numeric(6, 4);
  v_earned         numeric(12, 2);
  v_receipt_id     uuid := gen_random_uuid();
  v_number         integer;
  v_now            timestamptz := now();
  v_index          integer := 0;
  v_lines          jsonb := '[]'::jsonb;
  v_cash           numeric(12, 2) := round(coalesce(p_cash_amount, 0), 2);
  v_card           numeric(12, 2) := round(coalesce(p_card_amount, 0), 2);
  v_transfer       numeric(12, 2) := round(coalesce(p_transfer_amount, 0), 2);
  v_appt           public.appointments%rowtype;
  -- Already paid against this visit, before today's till transaction.
  v_prior          numeric(12, 2) := 0;
  -- How much of the deposit this bill actually absorbs. Capped at the total,
  -- so an over-deposit does not make the receipt claim more was applied to it
  -- than it was worth.
  v_applied        numeric(12, 2) := 0;
  -- What is left to collect now: the bill, less the deposit applied.
  v_due_now        numeric(12, 2);
  -- The discretionary discount: what was asked for, and what it came to.
  v_manual_type    text;
  v_manual_value   numeric(12, 2);
  v_manual_reason  text;
  v_manual         numeric(12, 2) := 0;
  v_after_deal     numeric(12, 2);
begin
  if v_salon_id is null then
    raise exception 'You are not signed in to a salon';
  end if;

  if v_role not in ('owner', 'receptionist') then
    raise exception 'Only an owner or receptionist can issue a receipt';
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'A receipt needs at least one service or product';
  end if;

  -- A customer rung up for the first time is created here, inside the same
  -- transaction as the sale, so a refused sale leaves no profile behind.
  if v_customer_id is null then
    v_customer_id := public.create_customer_checked(
      v_salon_id, p_new_customer_name, p_new_customer_phone, v_actor
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_customer_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_salon_id::text, 1));

  if not exists (
    select 1 from public.customers c
    where c.id = v_customer_id and c.salon_id = v_salon_id
  ) then
    raise exception 'That customer is not in this salon';
  end if;

  /*
   * Settling a booked visit. Deposits already taken against it are netted off
   * what the till collects, so the front desk is asked for the balance rather
   * than for the whole bill a second time.
   */
  if p_appointment_id is not null then
    select * into v_appt
    from public.appointments a
    where a.id = p_appointment_id and a.salon_id = v_salon_id;

    if not found then
      raise exception 'That appointment is not in this salon';
    end if;
    if v_appt.customer_id <> v_customer_id then
      raise exception 'That appointment belongs to a different customer';
    end if;
    if exists (
      select 1 from public.receipts r
      where r.appointment_id = p_appointment_id and r.status = 'issued'
    ) then
      raise exception 'That appointment has already been billed';
    end if;

    -- The same lock record_payment() takes, so a deposit cannot be accepted
    -- in the gap between reading the balance here and writing the receipt.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_appointment_id::text, 2)
    );

    select coalesce(round(sum(p.amount), 2), 0) into v_prior
    from public.payments p
    where p.appointment_id = p_appointment_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    /*
     * A retail product: priced from the catalogue like a service, but nobody
     * "performs" it, so it carries no team member and earns no commission (payroll
     * reads only lines with a team member). Stock is taken below, in one place.
     */
    if (v_line ->> 'product_id') is not null then
      select * into v_product
      from public.products p
      where p.id = (v_line ->> 'product_id')::uuid
        and p.salon_id = v_salon_id and p.is_active;

      if not found then
        raise exception 'A product on this receipt is not available';
      end if;

      v_quantity := greatest(1, coalesce((v_line ->> 'quantity')::integer, 1));
      v_gross := v_gross + (v_product.price * v_quantity);

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'item_type', 'product',
        'product_id', v_product.id,
        'service_id', null,
        'service_name', v_product.name,
        'staff_id', null,
        'appointment_id', null,
        'quantity', v_quantity,
        'unit_price', v_product.price,
        'gross', v_product.price * v_quantity,
        'discount', 0::numeric,
        'sort_order', v_index
      ));
      v_index := v_index + 1;
      continue;
    end if;

    select * into v_service
    from public.services s
    where s.id = (v_line ->> 'service_id')::uuid
      and s.salon_id = v_salon_id;

    if not found then
      raise exception 'A service on this receipt is not in this salon';
    end if;

    v_quantity := greatest(1, coalesce((v_line ->> 'quantity')::integer, 1));

    if (v_line ->> 'staff_id') is null then
      raise exception 'Every service must be attributed to the team member who performed it';
    end if;

    /*
     * The line names a ROSTER entry, not a login. The old check read
     * profiles.role and refused receptionists, because "can perform a service"
     * used to be inferred from a job title on a login. Being on the roster IS
     * that statement now -- a receptionist who also does nails simply has a
     * roster entry, and someone who performs nothing has none.
     */
    select tm.is_active into v_staff_active
    from public.team_members tm
    where tm.id = (v_line ->> 'staff_id')::uuid and tm.salon_id = v_salon_id;

    if v_staff_active is null then
      raise exception 'A team member on this receipt is not on this salon''s roster';
    end if;
    if not v_staff_active then
      raise exception 'A team member on this receipt is no longer active';
    end if;

    v_gross := v_gross + (v_service.price * v_quantity);

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'service_id', v_service.id,
      'service_name', v_service.name,
      'staff_id', (v_line ->> 'staff_id')::uuid,
      'appointment_id', nullif(v_line ->> 'appointment_id', '')::uuid,
      'quantity', v_quantity,
      'unit_price', v_service.price,
      'gross', v_service.price * v_quantity,
      'discount', 0::numeric,
      'sort_order', v_index
    ));
    v_index := v_index + 1;
  end loop;

  v_gross := round(v_gross, 2);

  /*
   * Take the stock, per product, in a fixed order so two sales of the same items
   * cannot deadlock. The guard in the WHERE clause is the check: a sale that would
   * take stock below zero is refused whole, and nothing above it is kept.
   */
  for v_stock in
    select (l ->> 'product_id')::uuid as product_id,
           sum((l ->> 'quantity')::integer)::integer as qty
    from jsonb_array_elements(v_lines) l
    where l ->> 'item_type' = 'product'
    group by 1
    order by 1
  loop
    update public.products p
    set stock_quantity = p.stock_quantity - v_stock.qty
    where p.id = v_stock.product_id and p.salon_id = v_salon_id
      and p.stock_quantity >= v_stock.qty;

    if not found then
      select * into v_product from public.products p where p.id = v_stock.product_id;
      raise exception 'Not enough % in stock (% left, % on this sale)',
        v_product.name, v_product.stock_quantity, v_stock.qty;
    end if;
  end loop;

  if p_deal_id is not null then
    select * into v_deal
    from public.deals d
    where d.id = p_deal_id and d.salon_id = v_salon_id and d.is_active;

    if not found then
      raise exception 'That deal is not available';
    end if;

    if v_now::date < v_deal.starts_on or v_now::date > v_deal.ends_on then
      raise exception 'That deal is not running today';
    end if;

    select array_agg(ds.service_id) into v_deal_services
    from public.deal_services ds where ds.deal_id = v_deal.id;

    v_deal_services := coalesce(v_deal_services, array[]::uuid[]);

    select coalesce(sum((l ->> 'gross')::numeric), 0) into v_eligible_gross
    from jsonb_array_elements(v_lines) l
    where (l ->> 'service_id')::uuid = any (v_deal_services);

    if v_eligible_gross <= 0 then
      raise exception 'Nothing on this receipt qualifies for that deal';
    end if;

    if v_deal.deal_type = 'percentage' then
      v_discount_total := round(v_eligible_gross * v_deal.value / 100, 2);

    elsif v_deal.deal_type = 'fixed_amount' then
      v_discount_total := least(round(v_deal.value, 2), v_eligible_gross);

    else
      select array_agg(distinct (l ->> 'service_id')::uuid) into v_present
      from jsonb_array_elements(v_lines) l
      where (l ->> 'service_id')::uuid = any (v_deal_services);

      if not (v_deal_services <@ coalesce(v_present, array[]::uuid[])) then
        raise exception 'That bundle needs every one of its services on the receipt';
      end if;

      v_bundle_cut := v_eligible_gross - round(v_deal.value, 2);
      v_discount_total := greatest(v_bundle_cut, 0);
    end if;

    v_lines := (
      select jsonb_agg(
        case
          when (l ->> 'service_id')::uuid = any (v_deal_services)
          then jsonb_set(
                 l, '{discount}',
                 to_jsonb(round(
                   v_discount_total * ((l ->> 'gross')::numeric / v_eligible_gross), 2
                 ))
               )
          else l
        end
        order by (l ->> 'sort_order')::integer
      )
      from jsonb_array_elements(v_lines) l
    );

    declare
      v_allocated numeric(12, 2);
      v_drift     numeric(12, 2);
      v_target    integer;
    begin
      select coalesce(sum((l ->> 'discount')::numeric), 0) into v_allocated
      from jsonb_array_elements(v_lines) l;

      v_drift := v_discount_total - v_allocated;

      if v_drift <> 0 then
        select (l ->> 'sort_order')::integer into v_target
        from jsonb_array_elements(v_lines) l
        where (l ->> 'service_id')::uuid = any (v_deal_services)
        order by (l ->> 'gross')::numeric desc
        limit 1;

        v_lines := (
          select jsonb_agg(
            case
              when (l ->> 'sort_order')::integer = v_target
              then jsonb_set(l, '{discount}',
                     to_jsonb(round((l ->> 'discount')::numeric + v_drift, 2)))
              else l
            end
            order by (l ->> 'sort_order')::integer
          )
          from jsonb_array_elements(v_lines) l
        );
      end if;
    end;
  end if;

  /*
   * A discretionary discount, applied to what remains after any deal.
   *
   * It is worked out here, from the catalogue prices and the deal already
   * computed, never taken from the caller as an amount: the caller supplies
   * only "10 percent" or "15 off" and a reason. It is then spread across the
   * lines in proportion to what is left on each, so receipt_line_items.line_total
   * -- which payroll reads -- is the discounted figure and commission follows
   * the receipt, not the quote. A rounding remainder goes to the largest line,
   * so the lines always add up to the receipt.
   */
  v_manual_type := nullif(btrim(coalesce(p_manual_discount_type, '')), '');

  if v_manual_type is not null then
    if v_manual_type not in ('percentage', 'fixed_amount') then
      raise exception 'Choose a percentage or a fixed amount for the discount';
    end if;

    v_manual_value := round(coalesce(p_manual_discount_value, 0), 2);
    v_manual_reason := btrim(coalesce(p_manual_discount_reason, ''));

    if v_manual_value <= 0 then
      raise exception 'Enter a discount greater than zero';
    end if;
    if char_length(v_manual_reason) < 3 then
      raise exception 'Give a reason for the discount';
    end if;
    if char_length(v_manual_reason) > 200 then
      raise exception 'The discount reason is too long (200 characters at most)';
    end if;

    v_after_deal := round(v_gross - v_discount_total, 2);

    if v_manual_type = 'percentage' then
      if v_manual_value > 100 then
        raise exception 'A percentage discount cannot exceed 100%%';
      end if;
      v_manual := round(v_after_deal * v_manual_value / 100, 2);
    else
      if v_manual_value > v_after_deal then
        raise exception 'A discount cannot exceed the value of the services';
      end if;
      v_manual := v_manual_value;
    end if;

    if v_manual > 0 then
      v_lines := (
        select jsonb_agg(
          jsonb_set(
            l, '{discount}',
            to_jsonb(round(
              (l ->> 'discount')::numeric
              + v_manual * (((l ->> 'gross')::numeric - (l ->> 'discount')::numeric) / v_after_deal),
              2
            ))
          )
          order by (l ->> 'sort_order')::integer
        )
        from jsonb_array_elements(v_lines) l
      );

      declare
        v_allocated numeric(12, 2);
        v_drift     numeric(12, 2);
        v_target    integer;
      begin
        select coalesce(sum((l ->> 'discount')::numeric), 0) into v_allocated
        from jsonb_array_elements(v_lines) l;

        -- The deal's share plus the manual share, against what was meant to be.
        v_drift := (v_discount_total + v_manual) - v_allocated;

        if v_drift <> 0 then
          select (l ->> 'sort_order')::integer into v_target
          from jsonb_array_elements(v_lines) l
          order by ((l ->> 'gross')::numeric - (l ->> 'discount')::numeric) desc
          limit 1;

          v_lines := (
            select jsonb_agg(
              case
                when (l ->> 'sort_order')::integer = v_target
                then jsonb_set(l, '{discount}',
                       to_jsonb(round((l ->> 'discount')::numeric + v_drift, 2)))
                else l
              end
              order by (l ->> 'sort_order')::integer
            )
            from jsonb_array_elements(v_lines) l
          );
        end if;
      end;

      v_discount_total := round(v_discount_total + v_manual, 2);
    end if;
  end if;

  v_bill := round(v_gross - v_discount_total, 2);
  if v_bill < 0 then
    raise exception 'A discount cannot exceed the value of the services';
  end if;

  v_balance := public.customer_loyalty_balance(v_customer_id);
  v_redeem := round(greatest(coalesce(p_loyalty_redeem, 0), 0), 2);

  if v_redeem > greatest(v_balance, 0) then
    raise exception 'Only % is available to redeem', to_char(greatest(v_balance, 0), 'FM999999990.00');
  end if;
  if v_redeem > v_bill then
    raise exception 'Loyalty redemption cannot exceed the bill total';
  end if;

  v_total := round(v_bill - v_redeem, 2);

  /*
   * The deposits can exceed the bill -- a discount applied at the till does
   * it. The receipt absorbs only what it is worth, nothing is collected now,
   * and the excess stays visible as a negative balance on the appointment,
   * where the owner can refund it. Refusing the sale instead would leave the
   * salon holding a deposit with no receipt to explain it.
   */
  v_applied := round(least(v_prior, v_total), 2);
  v_due_now := round(v_total - v_applied, 2);

  if p_payment_method = 'cash' then
    v_cash := v_due_now; v_card := 0; v_transfer := 0;
  elsif p_payment_method = 'card' then
    v_card := v_due_now; v_cash := 0; v_transfer := 0;
  elsif p_payment_method = 'bank_transfer' then
    v_transfer := v_due_now; v_cash := 0; v_card := 0;
  -- A split may now be across any of the three, not just cash and card.
  elsif v_cash + v_card + v_transfer <> v_due_now then
    raise exception
      'The split (% cash + % card + % transfer) does not add up to %',
      to_char(v_cash, 'FM999999990.00'), to_char(v_card, 'FM999999990.00'),
      to_char(v_transfer, 'FM999999990.00'), to_char(v_due_now, 'FM999999990.00');
  end if;

  select ss.loyalty_earn_rate into v_rate
  from public.salon_settings ss where ss.salon_id = v_salon_id;
  v_rate := coalesce(v_rate, 0.05);

  v_earned := round(v_total * v_rate, 2);

  select coalesce(max(r.receipt_number), 0) + 1 into v_number
  from public.receipts r where r.salon_id = v_salon_id;

  insert into public.receipts (
    id, salon_id, receipt_number, customer_id, issued_by, deal_id,
    subtotal, discount_total, loyalty_redeemed, total,
    loyalty_earned, loyalty_earn_rate,
    payment_method, cash_amount, card_amount, transfer_amount, notes, created_at,
    appointment_id, deposit_applied,
    manual_discount_type, manual_discount_value, manual_discount_amount,
    manual_discount_reason
  ) values (
    v_receipt_id, v_salon_id, v_number, v_customer_id, v_actor, p_deal_id,
    v_gross, v_discount_total, v_redeem, v_total,
    v_earned, v_rate,
    p_payment_method, v_cash, v_card, v_transfer, coalesce(p_notes, ''), v_now,
    p_appointment_id, v_applied,
    v_manual_type, v_manual_value, v_manual, coalesce(v_manual_reason, '')
  );

  insert into public.receipt_line_items (
    salon_id, receipt_id, item_type, product_id, service_id, service_name, staff_id, appointment_id,
    quantity, unit_price, discount_amount, line_total, performed_at, sort_order
  )
  select
    v_salon_id, v_receipt_id,
    coalesce(l ->> 'item_type', 'service'),
    nullif(l ->> 'product_id', '')::uuid,
    (l ->> 'service_id')::uuid,
    l ->> 'service_name',
    (l ->> 'staff_id')::uuid,
    nullif(l ->> 'appointment_id', '')::uuid,
    (l ->> 'quantity')::integer,
    (l ->> 'unit_price')::numeric,
    (l ->> 'discount')::numeric,
    round((l ->> 'gross')::numeric - (l ->> 'discount')::numeric, 2),
    v_now,
    (l ->> 'sort_order')::integer
  from jsonb_array_elements(v_lines) l;

  /*
   * What the till took, as its own ledger events -- one per method, so a split
   * reads back as the two payments it actually was rather than one blended
   * row. Note that cash_amount and card_amount on the receipt now mean
   * "collected at this transaction", which for a visit carrying a deposit is
   * less than the total.
   */
  if v_cash > 0 then
    insert into public.payments
      (salon_id, customer_id, appointment_id, receipt_id, kind, method,
       amount, paid_at, note, recorded_by)
    values
      (v_salon_id, v_customer_id, p_appointment_id, v_receipt_id, 'settlement',
       'cash', v_cash, v_now, '', v_actor);
  end if;

  if v_card > 0 then
    insert into public.payments
      (salon_id, customer_id, appointment_id, receipt_id, kind, method,
       amount, paid_at, note, recorded_by)
    values
      (v_salon_id, v_customer_id, p_appointment_id, v_receipt_id, 'settlement',
       'card', v_card, v_now, '', v_actor);
  end if;

  if v_transfer > 0 then
    insert into public.payments
      (salon_id, customer_id, appointment_id, receipt_id, kind, method,
       amount, paid_at, note, recorded_by)
    values
      (v_salon_id, v_customer_id, p_appointment_id, v_receipt_id, 'settlement',
       'bank_transfer', v_transfer, v_now, '', v_actor);
  end if;

  if v_redeem > 0 then
    v_balance := v_balance - v_redeem;
    insert into public.loyalty_transactions
      (salon_id, customer_id, receipt_id, type, amount, resulting_balance, created_at)
    values
      (v_salon_id, v_customer_id, v_receipt_id, 'redeem', -v_redeem, v_balance, v_now);

    insert into public.audit_logs
      (salon_id, actor_id, actor_role, action, entity_type, entity_id, metadata)
    values (
      v_salon_id, v_actor, v_role, 'loyalty.redeemed', 'receipt', v_receipt_id::text,
      jsonb_build_object('customer_id', v_customer_id, 'amount', v_redeem,
                         'resulting_balance', v_balance)
    );
  end if;

  if v_earned > 0 then
    v_balance := v_balance + v_earned;
    insert into public.loyalty_transactions
      (salon_id, customer_id, receipt_id, type, amount, resulting_balance, created_at)
    values
      (v_salon_id, v_customer_id, v_receipt_id, 'earn', v_earned, v_balance, v_now);
  end if;

  insert into public.audit_logs
    (salon_id, actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_salon_id, v_actor, v_role, 'receipt.created', 'receipt', v_receipt_id::text,
    jsonb_build_object(
      'receipt_number', v_number, 'customer_id', v_customer_id,
      'subtotal', v_gross, 'discount_total', v_discount_total,
      'loyalty_redeemed', v_redeem, 'total', v_total, 'loyalty_earned', v_earned,
      'payment_method', p_payment_method,
      'manual_discount_type', v_manual_type,
      'manual_discount_value', v_manual_value,
      'manual_discount_amount', v_manual,
      'already_paid', v_prior, 'deposit_applied', v_applied,
      'collected_now', v_due_now,
      'appointment_id', p_appointment_id,
      'product_lines', (select count(*) from jsonb_array_elements(v_lines) l where l ->> 'item_type' = 'product')
    )
  );

  -- A discretionary discount is a decision someone made, so it is its own
  -- audit entry (with the reason they gave), not only a field on the receipt.
  if v_manual > 0 then
    insert into public.audit_logs
      (salon_id, actor_id, actor_role, action, entity_type, entity_id, metadata)
    values (
      v_salon_id, v_actor, v_role, 'receipt.discount_applied', 'receipt', v_receipt_id::text,
      jsonb_build_object(
        'receipt_number', v_number,
        'type', v_manual_type,
        'value', v_manual_value,
        'amount', v_manual,
        'reason', v_manual_reason
      )
    );
  end if;

  return v_receipt_id;
end;
$$;

revoke execute on function public.create_receipt(
  uuid, public.payment_method, numeric, numeric, numeric, uuid, text, jsonb,
  text, text, uuid, numeric, text, numeric, text
) from public;
grant execute on function public.create_receipt(
  uuid, public.payment_method, numeric, numeric, numeric, uuid, text, jsonb,
  text, text, uuid, numeric, text, numeric, text
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- void_receipt(): returns the stock
-- -----------------------------------------------------------------------------
create or replace function public.void_receipt(p_receipt_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon_id uuid := public.current_salon_id();
  v_actor    uuid := (select auth.uid());
  v_receipt  public.receipts%rowtype;
  v_balance  numeric(12, 2);
  v_now      timestamptz := now();
  v_taken    numeric(12, 2);
begin
  if v_salon_id is null then
    raise exception 'You are not signed in to a salon';
  end if;

  -- Voiding moves money, so it is the owner's call alone.
  if not public.is_owner() then
    raise exception 'Only the salon owner can void a receipt';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Voiding a receipt requires a reason';
  end if;

  select * into v_receipt
  from public.receipts r
  where r.id = p_receipt_id and r.salon_id = v_salon_id
  for update;

  if not found then
    raise exception 'That receipt could not be found';
  end if;
  if v_receipt.status = 'voided' then
    raise exception 'That receipt is already voided';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_receipt.customer_id::text, 0)
  );

  v_balance := public.customer_loyalty_balance(v_receipt.customer_id);

  -- Take back what the receipt granted...
  if v_receipt.loyalty_earned > 0 then
    v_balance := v_balance - v_receipt.loyalty_earned;
    insert into public.loyalty_transactions
      (salon_id, customer_id, receipt_id, type, amount, resulting_balance, created_at)
    values
      (v_salon_id, v_receipt.customer_id, v_receipt.id, 'void_reversal',
       -v_receipt.loyalty_earned, v_balance, v_now);
  end if;

  -- ...and give back what it consumed. If the customer has already spent the
  -- points this receipt granted, the balance can land below zero. That is left
  -- visible rather than clamped: it is a real debt, and redemption is capped at
  -- zero elsewhere so it cannot be spent.
  if v_receipt.loyalty_redeemed > 0 then
    v_balance := v_balance + v_receipt.loyalty_redeemed;
    insert into public.loyalty_transactions
      (salon_id, customer_id, receipt_id, type, amount, resulting_balance, created_at)
    values
      (v_salon_id, v_receipt.customer_id, v_receipt.id, 'void_reversal',
       v_receipt.loyalty_redeemed, v_balance, v_now);
  end if;

  -- Reverse what was actually taken at the till for this receipt.
  select coalesce(round(sum(p.amount), 2), 0) into v_taken
  from public.payments p
  where p.receipt_id = p_receipt_id;

  if v_taken > 0 then
    insert into public.payments
      (salon_id, customer_id, appointment_id, receipt_id, kind, method,
       amount, paid_at, note, recorded_by)
    values
      (v_salon_id, v_receipt.customer_id, v_receipt.appointment_id, p_receipt_id,
       'refund', 'other', -v_taken, v_now,
       'Receipt voided: ' || btrim(p_reason), v_actor);
  end if;

  -- Put the products back on the shelf.
  update public.products p
  set stock_quantity = p.stock_quantity + s.qty
  from (
    select li.product_id, sum(li.quantity)::integer as qty
    from public.receipt_line_items li
    where li.receipt_id = v_receipt.id and li.item_type = 'product' and li.product_id is not null
    group by li.product_id
  ) s
  where p.id = s.product_id and p.salon_id = v_salon_id;

  update public.receipts
  set status = 'voided',
      void_reason = btrim(p_reason),
      voided_at = v_now,
      voided_by = v_actor
  where id = v_receipt.id;

  insert into public.audit_logs
    (salon_id, actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_salon_id, v_actor, 'owner', 'receipt.voided', 'receipt', v_receipt.id::text,
    jsonb_build_object(
      'receipt_number', v_receipt.receipt_number,
      'customer_id', v_receipt.customer_id,
      'total', v_receipt.total,
      'loyalty_earned_reversed', v_receipt.loyalty_earned,
      'loyalty_redeemed_restored', v_receipt.loyalty_redeemed,
      'payments_reversed', v_taken,
      'reason', btrim(p_reason)
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Payroll: support commission on service lines only
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
      and li.item_type = 'service'   -- products earn no commission
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

-- -----------------------------------------------------------------------------
-- Reports: services and products, separately and together
-- -----------------------------------------------------------------------------
create or replace function public.report_revenue_by_service(p_from date, p_to date)
returns table (
  service_name text,
  quantity     bigint,
  revenue      numeric,
  discounts    numeric
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
    li.service_name,
    sum(li.quantity)::bigint,
    round(sum(li.line_total), 2),
    round(sum(li.discount_amount), 2)
  from public.receipt_line_items li
  join public.receipts r on r.id = li.receipt_id
  where r.status = 'issued'
    and li.item_type = 'service'
    and (li.performed_at at time zone v_tz)::date between p_from and p_to
  group by li.service_name
  order by 3 desc;
end;
$$;

create or replace function public.report_revenue_by_staff(p_from date, p_to date)
returns table (
  staff_id   uuid,
  staff_name text,
  services   bigint,
  revenue    numeric
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
    li.staff_id,
    coalesce(max(nullif(tm.full_name, '')), 'Former team member'),
    sum(li.quantity)::bigint,
    round(sum(li.line_total), 2)
  from public.receipt_line_items li
  join public.receipts r on r.id = li.receipt_id
  left join public.team_members tm on tm.id = li.staff_id
  where r.status = 'issued'
    and li.item_type = 'service'
    and (li.performed_at at time zone v_tz)::date between p_from and p_to
  group by li.staff_id
  order by 4 desc;
end;
$$;

create or replace function public.report_revenue_by_product(p_from date, p_to date)
returns table (
  product_name text,
  quantity     bigint,
  revenue      numeric,
  discounts    numeric
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
    li.service_name,
    sum(li.quantity)::bigint,
    round(sum(li.line_total), 2),
    round(sum(li.discount_amount), 2)
  from public.receipt_line_items li
  join public.receipts r on r.id = li.receipt_id
  where r.status = 'issued'
    and li.item_type = 'product'
    and (li.performed_at at time zone v_tz)::date between p_from and p_to
  group by li.service_name
  order by 3 desc;
end;
$$;

/*
 * Service sales, product sales, and the two together. Amounts are the lines'
 * own figures: after any discount, BEFORE loyalty redeemed (a payment method, not
 * a reduction of what was sold), so Combined can differ from the Revenue card by
 * exactly the loyalty redeemed in the period.
 */
create or replace function public.report_sales_split(p_from date, p_to date)
returns table (
  kind      text,
  receipts  bigint,
  quantity  bigint,
  gross     numeric,
  discounts numeric,
  revenue   numeric
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
  with lines as (
    select li.item_type, li.receipt_id, li.quantity,
           li.unit_price * li.quantity as gross, li.discount_amount, li.line_total
    from public.receipt_line_items li
    join public.receipts r on r.id = li.receipt_id
    where r.status = 'issued'
      and (li.performed_at at time zone v_tz)::date between p_from and p_to
  ),
  per_kind as (
    select k.kind, k.sort_key,
           count(distinct l.receipt_id)::bigint as receipts,
           coalesce(sum(l.quantity), 0)::bigint as quantity,
           coalesce(round(sum(l.gross), 2), 0) as gross,
           coalesce(round(sum(l.discount_amount), 2), 0) as discounts,
           coalesce(round(sum(l.line_total), 2), 0) as revenue
    from (values ('service', 1), ('product', 2)) as k(kind, sort_key)
    left join lines l on l.item_type = k.kind
    group by k.kind, k.sort_key
  )
  select u.kind, u.receipts, u.quantity, u.gross, u.discounts, u.revenue
  from (
    select p.sort_key, p.kind, p.receipts, p.quantity, p.gross, p.discounts, p.revenue
    from per_kind p
    union all
    select 3, 'combined',
           (select count(distinct l.receipt_id)::bigint from lines l),
           coalesce(sum(p.quantity), 0)::bigint, coalesce(sum(p.gross), 0),
           coalesce(sum(p.discounts), 0), coalesce(sum(p.revenue), 0)
    from per_kind p
  ) u
  order by u.sort_key;
end;
$$;

revoke execute on function public.report_revenue_by_product(date, date) from public;
revoke execute on function public.report_sales_split(date, date) from public;
grant execute on function public.report_revenue_by_product(date, date) to authenticated, service_role;
grant execute on function public.report_sales_split(date, date) to authenticated, service_role;
