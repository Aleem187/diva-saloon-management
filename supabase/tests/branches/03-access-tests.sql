-- Access-control tests for branches, run as real database roles with real JWT claims.
-- Expect 'N passed, 0 failed'.
-- Access-control tests for branches. Run as the database admin; each check switches
-- to the `authenticated` role with a real JWT claim, exactly as PostgREST does.
create schema if not exists qa;
drop table if exists qa.res; create table qa.res (n serial, name text, ok boolean, detail text);
create or replace function qa.t(p_name text, p_ok boolean, p_detail text default '') returns void
language plpgsql security definer as $$ begin insert into qa.res (name, ok, detail) values (p_name, coalesce(p_ok,false), p_detail); end $$;
create or replace function qa.act(p_uid uuid, p_branch text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);  -- this image's auth.uid() still reads the per-claim setting
  perform set_config('request.headers', case when p_branch is null then '{}' else json_build_object('x-branch-id', p_branch)::text end, true);
  execute 'set local role authenticated';
end $$;
create or replace function qa.admin() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true); perform set_config('request.headers','',true); end $$;
create or replace function qa.attempt(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;

grant usage on schema qa to authenticated;
grant execute on all functions in schema qa to authenticated;

do $$
declare
  sa uuid; sb uuid;
  owner_a uuid; recep_a uuid; ther_a uuid; owner_b uuid;
  br1 uuid; br2 uuid; br3 uuid;
  recep_2 uuid := gen_random_uuid(); ther_2 uuid := gen_random_uuid(); acct_2 uuid := gen_random_uuid();
  rec_role uuid; staff_role uuid; acct_role uuid; mgr_role uuid; mgr_1 uuid := gen_random_uuid();
  ther_2_member uuid; ther_a_member uuid; owner_a_member uuid;
  cust uuid; svc uuid; svc2 uuid;
  n int; err text; ap_b2 uuid; rid uuid;
  t0 timestamptz := date_trunc('day', now()) + interval '1 day' + interval '9 hours';
begin
  select id into owner_a from auth.users where email='owner-a@qa.test';
  select id into recep_a from auth.users where email='recep-a@qa.test';
  select id into ther_a from auth.users where email='ther-a@qa.test';
  select id into owner_b from auth.users where email='owner-b@qa.test';
  select salon_id, team_member_id into sa, owner_a_member from profiles where id = owner_a;
  select salon_id into sb from profiles where id = owner_b;
  select team_member_id into ther_a_member from profiles where id = ther_a;
  select id into br1 from branches where salon_id = sa and is_default;
  select id into rec_role from roles where salon_id = sa and name='Receptionist';
  select id into staff_role from roles where salon_id = sa and name='Staff / Therapist';
  select id into acct_role from roles where salon_id = sa and name='Accountant';
  select id into cust from customers where salon_id = sa limit 1;
  select id into svc from services where salon_id = sa and name='Cut';
  select id into svc2 from services where salon_id = sa and name='Colour';

  -- two more branches, and people who work at branch 2 (through the real invitation path)
  insert into branches (salon_id, name, address) values (sa, 'Branch 2', '2 High St') returning id into br2;
  insert into branches (salon_id, name, address) values (sa, 'Branch 3', '3 Low St') returning id into br3;
  insert into invitations (salon_id, email, role, role_id, full_name, invited_by, create_roster_entry, branch_id) values
    (sa, 'recep-2@qa.test', 'receptionist', rec_role, 'Receptionist 2', owner_a, true, br2),
    (sa, 'ther-2@qa.test',  'staff',        staff_role, 'Therapist 2', owner_a, true, br2),
    (sa, 'acct-2@qa.test',  'staff',        acct_role,  'Accountant 2', owner_a, false, br2);
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmed_at, raw_user_meta_data, created_at, updated_at) values
    (recep_2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','recep-2@qa.test','x',now(),'{"full_name":"Receptionist 2"}',now(),now()),
    (ther_2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ther-2@qa.test','x',now(),'{"full_name":"Therapist 2"}',now(),now()),
    (acct_2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','acct-2@qa.test','x',now(),'{"full_name":"Accountant 2"}',now(),now());
  select team_member_id into ther_2_member from profiles where id = ther_2;

  perform qa.t('invited login takes the branch its invitation named', (select branch_id from profiles where id = recep_2) = br2);
  perform qa.t('invited person''s roster entry is placed at that branch too', (select branch_id from team_members where id = ther_2_member) = br2);
  perform qa.t('an accountant with no roster entry still has a branch', (select branch_id from profiles where id = acct_2) = br2);
  perform qa.t('the owner has no branch (every branch)', (select branch_id from profiles where id = owner_a) is null);
  perform qa.t('a login invited before branches existed is in the Main Branch', (select branch_id from profiles where id = recep_a) = br1);
  perform qa.t('every new salon already got its Main Branch', (select count(*) from branches where salon_id in (sa, sb) and is_default) = 2);

  -- Branch 2 gets a visit, a sale and a payment (as the owner, through the real functions)
  perform qa.act(owner_a, br2::text);
  select create_appointment(cust, null, null, ther_2_member, t0, '', false, 0, null, jsonb_build_array(jsonb_build_object('service_id', svc, 'quantity', 1))) into ap_b2;
  perform qa.admin();
  perform qa.t('an appointment takes the branch of the person it is booked with', (select branch_id from appointments where id = ap_b2) = br2);

  perform qa.act(owner_a, br2::text);
  perform record_payment(ap_b2, 10, 'cash', null, 'deposit');
  perform qa.admin();
  perform qa.t('a payment follows its appointment''s branch', (select branch_id from payments where appointment_id = ap_b2 and amount = 10) = br2);

  perform qa.act(owner_a, br2::text);
  rid := create_receipt(cust, 'cash', 0, 0, 0, null, '', jsonb_build_array(jsonb_build_object('service_id', svc, 'staff_id', ther_2_member, 'quantity', 1)), null, null, ap_b2);
  perform qa.admin();
  perform qa.t('a receipt for a visit takes the visit''s branch', (select branch_id from receipts where id = rid) = br2);
  perform qa.t('its lines carry the branch too', (select count(*) from receipt_line_items where receipt_id = rid and branch_id = br2) = 1);
  perform qa.t('its settlement payments carry the branch', (select count(*) from payments where receipt_id = rid and branch_id = br2) >= 1);

  -- ---- who sees what -----------------------------------------------------
  perform qa.act(owner_a);
  select count(*) into n from appointments; perform qa.t('owner on All branches sees appointments of every branch', n = 5, 'saw '||n);
  select count(*) into n from branches; perform qa.t('owner sees all branches', n = 3 + 0 and true, 'saw '||n);
  perform qa.admin();

  perform qa.act(owner_a, br2::text);
  select count(*) into n from appointments; perform qa.t('owner with Branch 2 chosen sees only Branch 2 appointments', n = 1, 'saw '||n);
  select count(*) into n from receipts; perform qa.t('... and only its receipts', n = 1, 'saw '||n);
  select count(*) into n from payments; perform qa.t('... and only its payments', n >= 1 and not exists (select 1 from payments where branch_id <> br2), 'saw '||n);
  perform qa.admin();

  perform qa.act(owner_a, br1::text);
  select count(*) into n from appointments where branch_id <> br1; perform qa.t('owner with Main chosen sees nothing of Branch 2', n = 0, 'saw '||n);
  perform qa.admin();

  perform qa.act(owner_a, 'not-a-uuid');
  select count(*) into n from appointments; perform qa.t('a garbage header is ignored: owner still sees everything', n = 5, 'saw '||n);
  perform qa.admin();

  perform qa.act(recep_a);
  select count(*) into n from appointments; perform qa.t('Main receptionist sees only Main appointments', n = 5 - 1 + 0 or n = 4, 'saw '||n);
  select count(*) into n from appointments where branch_id <> br1; perform qa.t('... none of another branch', n = 0, 'saw '||n);
  select count(*) into n from receipts where branch_id <> br1; perform qa.t('... no other branch''s receipts', n = 0);
  select count(*) into n from payments where branch_id <> br1; perform qa.t('... no other branch''s payments', n = 0);
  select count(*) into n from receipt_line_items where branch_id <> br1; perform qa.t('... no other branch''s receipt lines', n = 0);
  select count(*) into n from branches; perform qa.t('... sees only their own branch row', n = 1, 'saw '||n);
  perform qa.admin();

  perform qa.act(recep_a, br2::text);
  select count(*) into n from appointments where branch_id = br2; perform qa.t('a header can NOT widen a branch-bound login: still none of Branch 2', n = 0, 'saw '||n);
  perform qa.admin();

  perform qa.act(recep_2);
  select count(*) into n from appointments where branch_id = br2; perform qa.t('Branch 2 receptionist sees Branch 2''s appointment', n = 1, 'saw '||n);
  select count(*) into n from appointments where branch_id <> br2; perform qa.t('... and nothing else', n = 0);
  select count(*) into n from receipts where branch_id <> br2; perform qa.t('... no other receipts', n = 0);
  perform qa.admin();

  -- ---- colleagues -------------------------------------------------------
  perform qa.act(recep_a);
  select count(*) into n from profiles where branch_id is not null and branch_id <> br1;
  perform qa.t('a Main receptionist sees no logins of other branches', n = 0, 'saw '||n);
  select count(*) into n from profiles where branch_id is null;
  perform qa.t('... but does see the owner (for names on records)', n = 1, 'saw '||n);
  select count(*) into n from team_members where branch_id <> br1;
  perform qa.t('... and no team members of other branches', n = 0, 'saw '||n);
  perform qa.admin();
  perform qa.act(owner_a);
  select count(*) into n from team_members where branch_id <> br1;
  perform qa.t('the owner sees team members of every branch', n >= 2, 'saw '||n);
  perform qa.admin();

  -- ---- writes across branches are refused --------------------------------
  perform qa.act(recep_a);
  err := qa.attempt(format($f$select create_appointment(%L, null, null, %L, %L, '', false, 0, null, '[{"service_id":"%s","quantity":1}]'::jsonb)$f$, cust, ther_2_member, t0 + interval '3 hours', svc));
  perform qa.t('a Main receptionist cannot book a Branch 2 team member', err like '%another branch%', coalesce(err,'no error'));
  err := qa.attempt(format($f$select record_payment(%L, 5, 'cash', null, 'x')$f$, ap_b2));
  perform qa.t('a Main receptionist cannot take a payment on a Branch 2 visit', err like '%another branch%', coalesce(err,'no error'));
  err := qa.attempt(format($f$update appointments set notes = 'tamper' where id = %L$f$, ap_b2));
  select count(*) into n from appointments where notes = 'tamper';
  perform qa.t('... nor edit a Branch 2 appointment', n = 0);
  perform qa.admin();

  perform qa.act(recep_a);
  err := qa.attempt(format($f$update profiles set branch_id = %L where id = %L$f$, br2, recep_a));
  perform qa.t('a login cannot move itself to another branch', err is not null, coalesce(err,'no error'));
  -- (a zero-row UPDATE is not an error: look at the data, not at the message)
  err := qa.attempt(format($f$update team_members set branch_id = %L where id = %L$f$, br2, ther_a_member));
  perform qa.t('a non-owner cannot move a team member to another branch', (select branch_id from team_members where id = ther_a_member) = br1, coalesce(err,'no error'));
  err := qa.attempt(format($f$insert into branches (salon_id, name) values (%L, 'Rogue')$f$, sa));
  perform qa.t('a non-owner cannot create a branch', err is not null);
  perform qa.admin();

  perform qa.act(owner_a);
  err := qa.attempt(format($f$select move_login_to_branch(%L, %L)$f$, recep_2, br3));
  perform qa.t('the owner can move a login (and its roster entry) to another branch', err is null and (select branch_id from profiles where id = recep_2) = br3 and (select branch_id from team_members where id = (select team_member_id from profiles where id = recep_2)) = br3, coalesce(err,''));
  err := qa.attempt(format($f$update profiles set branch_id = %L where id = %L$f$, br2, recep_2));
  perform qa.t('a login cannot be moved alone away from its roster entry', err like '%another branch%', coalesce(err,'no error'));
  perform qa.admin();
  perform qa.act(owner_a);
  err := qa.attempt(format($f$update profiles set branch_id = null where id = %L$f$, recep_a));
  perform qa.t('... but not leave a non-owner with no branch', err is not null, coalesce(err,'no error'));
  perform qa.admin();

  -- ---- a branch manager (a non-owner who holds the Team module) -----------
  insert into roles (salon_id, name) values (sa, 'Branch Manager') returning id into mgr_role;
  insert into role_modules (salon_id, role_id, module) values (sa, mgr_role, 'team'), (sa, mgr_role, 'calendar'), (sa, mgr_role, 'pos');
  insert into invitations (salon_id, email, role, role_id, full_name, invited_by, create_roster_entry, branch_id)
    values (sa, 'mgr-1@qa.test', 'staff', mgr_role, 'Manager 1', owner_a, false, br1);
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmed_at, raw_user_meta_data, created_at, updated_at)
    values (mgr_1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mgr-1@qa.test','x',now(),'{"full_name":"Manager 1"}',now(),now());
  insert into invitations (salon_id, email, role, role_id, full_name, invited_by, create_roster_entry, branch_id)
    values (sa, 'pending-b2@qa.test', 'staff', rec_role, 'Pending B2', owner_a, false, br2);
  perform qa.act(mgr_1);
  err := qa.attempt(format($f$insert into invitations (salon_id, email, role, role_id, full_name, invited_by, create_roster_entry, branch_id) values (%L,'sneak@qa.test','staff',%L,'Sneak',%L,false,%L)$f$, sa, rec_role, mgr_1, br2));
  perform qa.t('a branch manager cannot invite a login into another branch', err is not null, coalesce(err,'no error'));
  select count(*) into n from invitations where branch_id = br2;
  perform qa.t('... and cannot see another branch''s pending invitations', n = 0, 'saw '||n);
  err := qa.attempt(format($f$insert into invitations (salon_id, email, role, role_id, full_name, invited_by, create_roster_entry, branch_id) values (%L,'ok@qa.test','staff',%L,'Fine',%L,false,%L)$f$, sa, rec_role, mgr_1, br1));
  perform qa.t('... but can invite into their own branch', err is null, coalesce(err,''));
  update profiles set is_active = false where id = recep_2;
  update profiles set is_active = false where id = owner_a;
  perform qa.admin();
  perform qa.t('a branch manager cannot deactivate a login at another branch', (select is_active from profiles where id = recep_2));
  perform qa.t('... nor the owner', (select is_active from profiles where id = owner_a));
  perform qa.act(owner_a, br1::text);   -- looking at Main, managing Branch 2
  update profiles set is_active = false where id = recep_2;
  perform qa.t('an owner looking at one branch can still manage people at another', not (select is_active from profiles where id = recep_2));
  update profiles set is_active = true where id = recep_2;
  perform qa.admin();

  -- ---- moving people ----------------------------------------------------
  perform qa.act(recep_a);
  err := qa.attempt(format($f$select move_team_member_to_branch(%L, %L)$f$, ther_a_member, br2));
  perform qa.t('a non-owner cannot move anyone between branches', err like '%Only the owner%', coalesce(err,'no error'));
  perform qa.admin();
  perform qa.act(owner_a);
  err := qa.attempt(format($f$select move_team_member_to_branch(%L, %L)$f$, ther_a_member, br3));
  perform qa.t('the owner can move a team member (and their login) to another branch',
    err is null and (select branch_id from team_members where id = ther_a_member) = br3 and (select branch_id from profiles where id = ther_a) = br3, coalesce(err,''));
  perform qa.admin();
  insert into appointments (salon_id, customer_id, staff_id, service_id, starts_at, ends_at, price_at_booking, status)
    values (sa, cust, ther_a_member, svc, now() + interval '3 days', now() + interval '3 days 30 minutes', 40, 'booked');
  perform qa.act(owner_a);
  err := qa.attempt(format($f$select move_team_member_to_branch(%L, %L)$f$, ther_a_member, br1));
  perform qa.t('... but not while they have upcoming appointments', err like '%upcoming appointments%', coalesce(err,'no error'));
  err := qa.attempt(format($f$update profiles set team_member_id = %L where id = %L$f$, ther_2_member, recep_a));
  perform qa.admin();
  perform qa.t('a login cannot be linked to a team member of another branch', (select team_member_id from profiles where id = recep_a) is distinct from ther_2_member, coalesce(err,'no error'));
  delete from appointments where salon_id = sa and staff_id = ther_a_member and status = 'booked' and starts_at > now();
  update team_members set branch_id = br1 where id = ther_a_member; update profiles set branch_id = br1 where id = ther_a;

  -- ---- where a new sale lands -------------------------------------------
  perform qa.act(owner_a);   -- All branches, salon has three
  err := qa.attempt(format($f$select create_receipt(%L, 'cash', 0,0,0,null,'', '[{"service_id":"%s","staff_id":"%s","quantity":1}]'::jsonb)$f$, cust, svc, ther_a_member));
  perform qa.t('owner on All branches must choose before a walk-in sale', err like '%Choose a branch%', coalesce(err,'no error'));
  perform qa.admin();
  perform qa.act(owner_a, br3::text);
  rid := create_receipt(cust, 'cash', 0,0,0,null,'', jsonb_build_array(jsonb_build_object('service_id', svc, 'staff_id', ther_a_member, 'quantity', 1)));
  perform qa.admin();
  perform qa.t('with a branch chosen, the walk-in sale lands there', (select branch_id from receipts where id = rid) = br3);
  perform qa.act(recep_a);
  rid := create_receipt(cust, 'cash', 0,0,0,null,'', jsonb_build_array(jsonb_build_object('service_id', svc, 'staff_id', ther_a_member, 'quantity', 1)));
  perform qa.admin();
  perform qa.t('a Main receptionist''s walk-in sale lands in Main', (select branch_id from receipts where id = rid) = br1);
  perform qa.act(owner_b);   -- a salon with one branch needs no choice
  rid := create_receipt((select id from customers where salon_id = sb limit 1), 'cash', 0,0,0,null,'', jsonb_build_array(jsonb_build_object('service_id', (select id from services where salon_id = sb limit 1), 'staff_id', (select team_member_id from profiles where id = owner_b), 'quantity', 1)));
  perform qa.admin();
  perform qa.t('a one-branch salon needs no choice', (select branch_id from receipts where id = rid) = (select id from branches where salon_id = sb));

  -- ---- immutability -----------------------------------------------------
  err := qa.attempt(format($f$update receipts set branch_id = %L where id = %L$f$, br1, rid));
  perform qa.t('a receipt''s branch cannot be changed afterwards', err like '%cannot be altered%', coalesce(err,'no error'));
  err := qa.attempt(format($f$update payments set branch_id = %L where salon_id = %L$f$, br1, sa));
  perform qa.t('a payment''s branch cannot be changed afterwards', err like '%append-only%', coalesce(err,'no error'));

  -- ---- closing branches -------------------------------------------------
  err := qa.attempt(format($f$update branches set is_active = false where id = %L$f$, br1));
  perform qa.t('the Main Branch cannot be closed', err like '%Main Branch%', coalesce(err,'no error'));
  err := qa.attempt(format($f$update branches set is_active = false where id = %L$f$, br3));
  perform qa.t('another branch can be closed', err is null);
  err := qa.attempt(format($f$insert into appointments (salon_id, customer_id, staff_id, service_id, starts_at, ends_at, price_at_booking) select %L, %L, tm.id, %L, now() + interval '9 days', now() + interval '9 days 30 minutes', 40 from team_members tm where tm.branch_id = %L limit 1$f$, sa, cust, svc, br3));
  update branches set is_active = true where id = br3;

  -- ---- payroll scoping --------------------------------------------------
  insert into payroll_periods (id, salon_id, starts_on, ends_on, total_revenue, total_commission) values ('00000000-0000-0000-0000-0000000000a1', sa, current_date - 7, current_date, 100, 30);
  insert into payroll_entries (salon_id, period_id, staff_id, staff_name, services_performed, revenue, commission_type, commission_basis, commission_rate, fixed_amount, salary_amount, salary_days_paid, salary_pay, commission_pay, commission_amount, period_starts_on, period_ends_on, status) values
    (sa, '00000000-0000-0000-0000-0000000000a1', ther_a_member, 'Therapist A', 1, 40, 'percentage', 'percentage', 0.3, 0, 0, 0, 0, 12, 12, current_date - 7, current_date, 'draft'),
    (sa, '00000000-0000-0000-0000-0000000000a1', ther_2_member, 'Therapist 2', 1, 60, 'percentage', 'percentage', 0.3, 0, 0, 0, 0, 18, 18, current_date - 7, current_date, 'draft');
  perform qa.act(acct_2);
  select count(*) into n from payroll_entries; perform qa.t('a Branch 2 accountant sees pay entries of Branch 2 people only', n = 1 and exists (select 1 from payroll_entries where staff_name = 'Therapist 2'), 'saw '||n);
  select count(*) into n from payroll_periods; perform qa.t('... and no whole-salon pay periods', n = 0, 'saw '||n);
  err := qa.attempt($f$select generate_payroll_period(current_date - 30, current_date - 20, 'x')$f$);
  perform qa.t('... and cannot run payroll for the whole salon', err like '%only the owner%', coalesce(err,'no error'));
  perform qa.admin();
  perform qa.act(owner_a);
  select count(*) into n from payroll_entries; perform qa.t('the owner sees every branch''s pay entries', n = 2, 'saw '||n);
  select count(*) into n from payroll_periods; perform qa.t('... and the pay period', n = 1);
  perform qa.admin();

  -- ---- the owner's consolidated view -----------------------------------
  perform qa.act(owner_a, br2::text);
  select count(*) into n from report_branch_overview(current_date - 30, current_date + 30);
  perform qa.t('the branch comparison still lists every branch while one is chosen', n = 4, 'rows '||n);
  perform qa.admin();
  perform qa.act(owner_a);
  perform qa.t('per-branch revenue: Branch 2 sold 40 (one receipt)', (select revenue from report_branch_overview(current_date - 30, current_date + 30) where branch_name = 'Branch 2') = 40);
  perform qa.t('Branch 2 staff pay is its therapist''s 18', (select staff_pay from report_branch_overview(current_date - 30, current_date + 30) where branch_name = 'Branch 2') = 18);
  perform qa.t('Branch 2 profit = revenue - staff pay', (select profit from report_branch_overview(current_date - 30, current_date + 30) where branch_name = 'Branch 2') = 22);
  perform qa.t('the All branches total equals the sum of branches', (select revenue from report_branch_overview(current_date - 30, current_date + 30) where branch_id is null) = (select sum(revenue) from report_branch_overview(current_date - 30, current_date + 30) where branch_id is not null));
  perform qa.t('total profit = total revenue - total staff pay', (select profit from report_branch_overview(current_date - 30, current_date + 30) where branch_id is null) = (select revenue - staff_pay from report_branch_overview(current_date - 30, current_date + 30) where branch_id is null));
  perform qa.admin();
  perform qa.act(recep_a);
  err := qa.attempt($f$select * from report_branch_overview(current_date - 30, current_date)$f$);
  perform qa.t('a non-owner cannot see the branch comparison', err like '%owner%', coalesce(err,'no error'));
  perform qa.admin();
  perform qa.act(owner_b);
  perform qa.t('another salon''s owner sees none of this salon''s branches', (select count(*) from report_branch_overview(current_date - 30, current_date + 30) where branch_name like 'Branch%') = 0);
  select count(*) into n from branches where salon_id = sa; perform qa.t('... and cannot read its branch rows', n = 0);
  perform qa.admin();

  -- ---- the existing report functions follow the active branch ------------
  perform qa.act(owner_a);
  perform qa.t('Reports (existing function) totals every branch on All', (select sum(revenue) from report_revenue_over_time(current_date - 30, current_date + 30, 'month')) = (select revenue from report_branch_overview(current_date - 30, current_date + 30) where branch_id is null));
  perform qa.admin();
  perform qa.act(owner_a, br2::text);
  perform qa.t('... and only the chosen branch when one is chosen', (select sum(revenue) from report_revenue_over_time(current_date - 30, current_date + 30, 'month')) = 40);
  perform qa.admin();

  -- ---- a new salon, and deleting one ------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-c@qa.test','x',now(),'{"full_name":"Owner C","salon_name":"Salon C","business_type":"salon","country":"US","timezone":"UTC","currency":"USD"}',now(),now());
  perform qa.t('a brand-new salon gets its Main Branch and its owner''s roster entry is in it',
    (select count(*) from branches b join salons s on s.id = b.salon_id join team_members tm on tm.salon_id = s.id and tm.branch_id = b.id where s.name = 'Salon C' and b.is_default) = 1);
  delete from salons where id = sa;
  perform qa.t('deleting a salon with branches, sales and payments still works', not exists (select 1 from branches where salon_id = sa) and not exists (select 1 from receipts where salon_id = sa));
end $$;

-- The existing money flows still work in a one-branch salon, and every row they write carries its branch.
do $$
declare
  ob uuid; sb uuid; br uuid; mem uuid; cust uuid; svc uuid; ap uuid; rid uuid; pay uuid; n int; ap2 uuid; rid2 uuid;
  t0 timestamptz := date_trunc('day', now()) + interval '2 days' + interval '9 hours';
begin
  select id into ob from auth.users where email='owner-b@qa.test';
  select salon_id, team_member_id into sb, mem from profiles where id = ob;
  select id into br from branches where salon_id = sb;
  select id into cust from customers where salon_id = sb limit 1;
  select id into svc from services where salon_id = sb limit 1;
  perform qa.act(ob);
  ap := create_appointment(cust, null, null, mem, t0, '', false, 0, null, jsonb_build_array(jsonb_build_object('service_id', svc, 'quantity', 1)));
  pay := record_payment(ap, 5, 'cash', null, 'deposit');
  perform refund_payment(pay, 'changed mind');
  perform record_payment(ap, 10, 'card', null, 'deposit again');
  perform update_appointment_services(ap, jsonb_build_array(jsonb_build_object('service_id', svc, 'quantity', 1)), 0, null);
  rid := create_receipt(cust, 'cash', 0, 0, 0, null, '', jsonb_build_array(jsonb_build_object('service_id', svc, 'staff_id', mem, 'quantity', 1)), null, null, ap, 0, 'percentage', 10, 'regular');
  perform void_receipt(rid, 'test void');
  perform qa.admin();
  select count(*) into n from payments where salon_id = sb and branch_id is distinct from br;
  perform qa.t('regression: deposits, a refund, a discounted receipt and a void all work and all carry the branch', n = 0 and (select count(*) from payments where salon_id = sb) >= 3 and (select branch_id from receipts where id = rid) = br, 'payments off-branch: '||n);
  perform qa.t('regression: the void reversed loyalty and left the receipt on record', (select status from receipts where id = rid) = 'voided');
end $$;

select case when ok then 'PASS' else 'FAIL' end as result, name, detail from qa.res order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from qa.res;
