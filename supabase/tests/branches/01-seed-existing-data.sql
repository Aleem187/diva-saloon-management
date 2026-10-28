-- Data as it exists BEFORE branches: two salons, a receptionist, a therapist, visits, sales,
-- payments, loyalty. Fingerprints every table the branch migration changes, so
-- 02-compare-existing-data.sql can prove nothing was lost or altered.
-- Existing-state data, created the way the app creates it (before any branch exists).
create schema if not exists qa;
do $$
declare
  a_owner uuid := gen_random_uuid(); b_owner uuid := gen_random_uuid();
  a_recep uuid := gen_random_uuid(); a_ther uuid := gen_random_uuid();
  a_salon uuid; b_salon uuid; a_rec_role uuid; a_staff_role uuid;
  a_owner_member uuid; a_ther_member uuid; b_owner_member uuid;
  cust1 uuid := gen_random_uuid(); cust2 uuid := gen_random_uuid(); cust3 uuid := gen_random_uuid(); custb uuid := gen_random_uuid();
  svc1 uuid := gen_random_uuid(); svc2 uuid := gen_random_uuid(); svcb uuid := gen_random_uuid();
  ap1 uuid := gen_random_uuid(); ap2 uuid := gen_random_uuid(); ap3 uuid := gen_random_uuid(); ap4 uuid := gen_random_uuid(); apb uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  t0 timestamptz := date_trunc('day', now()) - interval '2 days' + interval '10 hours';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmed_at, raw_user_meta_data, created_at, updated_at)
  values
   (a_owner, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@qa.test','x', now(), jsonb_build_object('full_name','Owner A','salon_name','Salon A','business_type','salon','country','US','timezone','UTC','currency','USD'), now(), now()),
   (b_owner, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@qa.test','x', now(), jsonb_build_object('full_name','Owner B','salon_name','Salon B','business_type','salon','country','US','timezone','UTC','currency','USD'), now(), now());
  select salon_id, team_member_id into a_salon, a_owner_member from public.profiles where id = a_owner;
  select salon_id, team_member_id into b_salon, b_owner_member from public.profiles where id = b_owner;
  select id into a_rec_role from public.roles where salon_id = a_salon and name = 'Receptionist';
  select id into a_staff_role from public.roles where salon_id = a_salon and name = 'Staff / Therapist';

  insert into public.invitations (salon_id, email, role, role_id, full_name, invited_by, create_roster_entry)
  values (a_salon, 'recep-a@qa.test', 'receptionist', a_rec_role, 'Receptionist A', a_owner, true),
         (a_salon, 'ther-a@qa.test', 'staff', a_staff_role, 'Therapist A', a_owner, true);
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (a_recep, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','recep-a@qa.test','x', now(), '{"full_name":"Receptionist A"}', now(), now()),
         (a_ther, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','ther-a@qa.test','x', now(), '{"full_name":"Therapist A"}', now(), now());
  select team_member_id into a_ther_member from public.profiles where id = a_ther;

  insert into public.customers (id, salon_id, full_name, phone) values
    (cust1, a_salon, 'Cust One', '+15550000001'), (cust2, a_salon, 'Cust Two', '+15550000002'),
    (cust3, a_salon, 'Cust Three', '+15550000003'), (custb, b_salon, 'Cust B', '+15550000009');
  insert into public.services (id, salon_id, name, price, duration_minutes) values
    (svc1, a_salon, 'Cut', 40, 30), (svc2, a_salon, 'Colour', 60, 60), (svcb, b_salon, 'Cut B', 30, 30);

  insert into public.appointments (id, salon_id, customer_id, staff_id, service_id, starts_at, ends_at, price_at_booking, status, is_walk_in) values
    (ap1, a_salon, cust1, a_ther_member, svc1, t0, t0 + interval '30 minutes', 40, 'completed', false),
    (ap2, a_salon, cust2, a_ther_member, svc2, t0 + interval '1 hour', t0 + interval '2 hours', 60, 'completed', false),
    (ap3, a_salon, cust3, a_owner_member, svc1, t0 + interval '3 hours', t0 + interval '3 hours 30 minutes', 40, 'booked', false),
    (apb, b_salon, custb, b_owner_member, svcb, t0, t0 + interval '30 minutes', 30, 'completed', false);
  insert into public.appointments (id, salon_id, customer_id, staff_id, service_id, starts_at, ends_at, price_at_booking, status, is_walk_in, resolution_reason, resolved_at)
  values (ap4, a_salon, cust1, a_ther_member, svc1, t0 + interval '5 hours', t0 + interval '5 hours 30 minutes', 40, 'cancelled', false, 'customer cancelled', now());
  insert into public.appointment_services (salon_id, appointment_id, service_id, service_name, quantity, unit_price, duration_minutes)
  values (a_salon, ap1, svc1, 'Cut', 1, 40, 30), (a_salon, ap2, svc2, 'Colour', 1, 60, 60);

  insert into public.receipts (id, salon_id, receipt_number, customer_id, subtotal, total, loyalty_earn_rate, payment_method, cash_amount, card_amount, status, appointment_id, created_at)
  values (r1, a_salon, 1, cust1, 40, 40, 0.05, 'cash', 40, 0, 'issued', ap1, t0 + interval '40 minutes'),
         (r2, a_salon, 2, cust2, 60, 60, 0.05, 'card', 0, 60, 'issued', ap2, t0 + interval '2 hours 10 minutes'),
         (rb, b_salon, 1, custb, 30, 30, 0.05, 'cash', 30, 0, 'issued', apb, t0 + interval '40 minutes');
  insert into public.receipts (id, salon_id, receipt_number, customer_id, subtotal, total, loyalty_earn_rate, payment_method, cash_amount, card_amount, status, void_reason, voided_at, created_at)
  values (r3, a_salon, 3, cust3, 25, 25, 0.05, 'cash', 25, 0, 'voided', 'test void', now(), t0 + interval '4 hours');
  insert into public.receipt_line_items (salon_id, receipt_id, service_id, service_name, staff_id, quantity, unit_price, discount_amount, line_total, performed_at, sort_order) values
    (a_salon, r1, svc1, 'Cut', a_ther_member, 1, 40, 0, 40, t0 + interval '40 minutes', 0),
    (a_salon, r2, svc2, 'Colour', a_ther_member, 1, 60, 0, 60, t0 + interval '2 hours 10 minutes', 0),
    (a_salon, r3, svc1, 'Cut', a_owner_member, 1, 25, 0, 25, t0 + interval '4 hours', 0),
    (b_salon, rb, svcb, 'Cut B', b_owner_member, 1, 30, 0, 30, t0 + interval '40 minutes', 0);
  insert into public.payments (salon_id, customer_id, appointment_id, receipt_id, kind, method, amount, paid_at) values
    (a_salon, cust1, ap1, r1, 'settlement', 'cash', 40, t0 + interval '40 minutes'),
    (a_salon, cust2, ap2, r2, 'settlement', 'card', 60, t0 + interval '2 hours 10 minutes'),
    (a_salon, cust3, ap3, null, 'deposit', 'cash', 10, t0),
    (b_salon, custb, apb, rb, 'settlement', 'cash', 30, t0 + interval '40 minutes');
  insert into public.loyalty_transactions (salon_id, customer_id, receipt_id, type, amount, resulting_balance) values
    (a_salon, cust1, r1, 'earn', 2, 2), (a_salon, cust2, r2, 'earn', 3, 3);

  -- fingerprint of every table that gains a column, WITHOUT the new column
  create table qa.snap_before as
  select 'profiles' t, count(*) n, md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) d from public.profiles x union all
  select 'team_members', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.team_members x union all
  select 'appointments', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.appointments x union all
  select 'receipts', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.receipts x union all
  select 'receipt_line_items', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.receipt_line_items x union all
  select 'payments', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.payments x union all
  select 'invitations', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.invitations x union all
  select 'customers', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.customers x union all
  select 'loyalty_transactions', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.loyalty_transactions x;
end $$;
select t, n from qa.snap_before order by t;
