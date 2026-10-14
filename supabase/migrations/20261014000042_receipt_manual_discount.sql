-- =============================================================================
-- A discretionary discount at the till
--
-- The cashier may take a percentage or a fixed amount off the bill, on top of
-- any deal, giving a reason. Like every other figure on a receipt it is worked
-- out in Postgres: the caller supplies "10 percent" or "15 off" and a reason,
-- never an amount that lands on the receipt.
--
--   * It applies to what is left after the deal, and is spread across the lines
--     in proportion to what remains on each, so receipt_line_items.line_total
--     -- which payroll reads -- is the discounted figure. A discount given at
--     the till therefore reduces commission (CLAUDE.md rule 15).
--   * receipts.discount_total keeps meaning "all discount": deal plus this. The
--     existing check total = subtotal - discount_total - loyalty_redeemed holds
--     unchanged. The new columns record WHAT the discount was, for the receipt
--     and for the audit trail.
--   * A reason is required, and it is audited twice over: in the metadata of
--     receipt.created and as its own receipt.discount_applied entry.
--
-- There are no taxes or fees anywhere in this product (no rate, no setting, no
-- column), so none are added here: the total is the bill less discounts.
--
-- The old create_receipt() signature is dropped rather than overloaded. Two
-- functions that both accept a 12-argument call make the RPC ambiguous.
-- =============================================================================

alter table public.receipts
  add column manual_discount_type   text
    check (manual_discount_type in ('percentage', 'fixed_amount')),
  add column manual_discount_value  numeric(12, 2)
    check (manual_discount_value > 0),
  add column manual_discount_amount numeric(12, 2) not null default 0
    check (manual_discount_amount >= 0),
  add column manual_discount_reason text not null default '';

alter table public.receipts
  add constraint receipts_manual_discount_consistent
    check (
      (manual_discount_type is null
        and manual_discount_value is null
        and manual_discount_amount = 0
        and manual_discount_reason = '')
      or
      (manual_discount_type is not null
        and manual_discount_value is not null
        and char_length(manual_discount_reason) >= 3
        and manual_discount_amount <= discount_total)
    );

comment on column public.receipts.manual_discount_amount is
  'The part of discount_total that was a discretionary discount at the till (the rest is the deal).';

drop function public.create_receipt(
  uuid, public.payment_method, numeric, numeric, numeric, uuid, text, jsonb,
  text, text, uuid, numeric
);

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
    raise exception 'A receipt needs at least one service';
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
    salon_id, receipt_id, service_id, service_name, staff_id, appointment_id,
    quantity, unit_price, discount_amount, line_total, performed_at, sort_order
  )
  select
    v_salon_id, v_receipt_id,
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
      'appointment_id', p_appointment_id
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
