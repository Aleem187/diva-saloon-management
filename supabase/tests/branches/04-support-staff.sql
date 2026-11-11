-- Support / assistant staff on an appointment (migration 20261111000047).
-- Runs after 03-access-tests.sql in the same database and adds to qa.res. Salon A is
-- deleted by that file's cascade test, so this uses salon B.
do $$
declare
  owner_a uuid; sa uuid; br1 uuid; cust uuid; svc uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid;
  ap1 uuid; ap2 uuid; ap3 uuid; err text; rid uuid; period uuid;
  t0 timestamptz := date_trunc('day', now()) + interval '9 days' + interval '9 hours';
  lines jsonb;
  pay_lead numeric; pay_support numeric; rev numeric; n int;
begin
  select id into owner_a from auth.users where email='owner-b@qa.test';
  select salon_id into sa from profiles where id = owner_a;
  select id into br1 from branches where salon_id = sa and is_default;
  select id into cust from customers where salon_id = sa limit 1;
  select id into svc from services where salon_id = sa limit 1;
  insert into team_members (salon_id, full_name) values
    (sa,'Sup Lead 1'),(sa,'Sup Lead 2'),(sa,'Sup Helper 3'),(sa,'Sup Helper 4');
  select id into m1 from team_members where salon_id=sa and full_name='Sup Lead 1';
  select id into m2 from team_members where salon_id=sa and full_name='Sup Lead 2';
  select id into m3 from team_members where salon_id=sa and full_name='Sup Helper 3';
  select id into m4 from team_members where salon_id=sa and full_name='Sup Helper 4';
  lines := jsonb_build_array(jsonb_build_object('service_id', svc, 'quantity', 1));

  perform qa.act(owner_a);
  ap1 := create_appointment(cust, null, null, m1, t0, '', false, 0, null, lines);
  -- 1. the LEAD still conflicts
  err := qa.attempt(format($f$select create_appointment(%L, null, null, %L, %L, '', false, 0, null, %L::jsonb)$f$, cust, m1, t0 + interval '5 minutes', lines::text));
  perform qa.t('support: a double-booked LEAD is still refused', err is not null and err ilike '%conflicting key%' or err ilike '%no_double_booking%', coalesce(err,'no error'));

  -- 2. a support person busy elsewhere at the same time is allowed
  ap2 := create_appointment(cust, null, null, m2, t0, '', false, 0, null, lines);
  perform set_appointment_support(ap2, array[m1]);      -- m1 is the lead on ap1 at that very time
  perform qa.admin();
  perform qa.t('support: a support person already booked as lead elsewhere is allowed', (select count(*) from appointment_staff where appointment_id = ap2 and staff_id = m1) = 1);
  perform qa.t('support: the support row takes the appointment''s branch', (select branch_id from appointment_staff where appointment_id = ap2) = br1);

  -- 3. rules
  perform qa.act(owner_a);
  err := qa.attempt(format($f$select set_appointment_support(%L, array[%L]::uuid[])$f$, ap2, m2));
  perform qa.t('support: the lead cannot also be support', err ilike '%already the lead%', coalesce(err,'no error'));
  err := qa.attempt(format($f$select set_appointment_support(%L, array[%L,%L,%L]::uuid[])$f$, ap2, m1, m3, m4));
  perform qa.t('support: more than 2 support staff is refused', err ilike '%at most 2%', coalesce(err,'no error'));
  err := qa.attempt(format($f$select set_appointment_support(%L, array[%L,%L]::uuid[])$f$, ap2, m3, m3));
  perform qa.t('support: the same person twice is refused', err is not null, coalesce(err,'no error'));
  perform set_appointment_support(ap2, array[m1, m3]);
  perform qa.admin();
  perform qa.t('support: two support staff are kept, in order', (select array_agg(staff_id order by sort_order) from appointment_staff where appointment_id = ap2) = array[m1, m3]);

  -- 4. moving the lead onto a support person removes them from support
  perform qa.act(owner_a);
  update appointments set staff_id = m3, starts_at = t0 + interval '3 hours', ends_at = ends_at + interval '3 hours' where id = ap2;
  perform qa.admin();
  perform qa.t('support: becoming the lead drops the person from support', (select count(*) from appointment_staff where appointment_id = ap2 and staff_id = m3) = 0 and (select count(*) from appointment_staff where appointment_id = ap2) = 1);

  -- (Salon A, the only other salon, is deleted by 03's cascade test before this runs, so a
  -- cross-salon check lives in the policy itself: salon_id = current_salon_id().)

  -- 6. payroll: the support person earns on the lines, on top of the lead; revenue is not double counted
  delete from staff_compensation where staff_id in (m1, m2, m3, m4);
  update services set commission_basis = 'percentage', commission_rate = 0.10 where id = svc;
  perform qa.act(owner_a);
  ap3 := create_appointment(cust, null, null, m2, t0 + interval '1 day', '', false, 0, null, lines);
  perform set_appointment_support(ap3, array[m4]);
  rid := create_receipt(cust, 'cash', 0, 0, 0, null, '', jsonb_build_array(jsonb_build_object('service_id', svc, 'staff_id', m2, 'quantity', 1)), null, null, ap3);
  -- 7. the team is locked once invoiced
  err := qa.attempt(format($f$select set_appointment_support(%L, array[%L]::uuid[])$f$, ap3, m3));
  perform qa.t('support: the team is locked once the visit is invoiced', err ilike '%invoiced%', coalesce(err,'no error'));
  period := generate_payroll_period((current_date - 1), (current_date + 5), 'support test');
  perform qa.admin();
  select commission_amount, revenue into pay_lead, rev from payroll_entries where period_id = period and staff_id = m2;
  select commission_amount into pay_support from payroll_entries where period_id = period and staff_id = m4;
  perform qa.t('payroll: the lead earns commission as before', pay_lead > 0, 'lead: '||coalesce(pay_lead::text,'none'));
  perform qa.t('payroll: the support person earns the same commission on top', pay_support = pay_lead, 'support: '||coalesce(pay_support::text,'none')||' lead: '||pay_lead);
  perform qa.t('payroll: support revenue is not double counted', (select revenue from payroll_entries where period_id = period and staff_id = m4) = 0 and rev > 0, 'rev '||rev);
  perform qa.t('payroll: the support person''s services are counted', (select services_performed from payroll_entries where period_id = period and staff_id = m4) = 1);

  -- 8. voiding frees the team again
  perform qa.act(owner_a);
  perform void_receipt(rid, 'test');
  perform set_appointment_support(ap3, array[m3]);
  perform qa.admin();
  perform qa.t('support: after a void the team can change again', (select count(*) from appointment_staff where appointment_id = ap3 and staff_id = m3) = 1);
end $$;

select case when ok then 'PASS' else 'FAIL' end as result, name, detail from qa.res where name like 'support:%' or name like 'payroll:%' order by n;
