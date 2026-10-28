-- After the branch migration: every pre-existing column of every changed table must be
-- IDENTICAL to the fingerprint taken before, no row may be left without a branch, and
-- every salon must have its Main Branch.
drop table if exists qa.snap_after;
create table qa.snap_after as
select 'profiles' t, count(*) n, md5(string_agg((to_jsonb(x) - 'branch_id')::text, '|' order by id::text)) d from public.profiles x union all
select 'team_members', count(*), md5(string_agg((to_jsonb(x) - 'branch_id')::text, '|' order by id::text)) from public.team_members x union all
select 'appointments', count(*), md5(string_agg((to_jsonb(x) - 'branch_id')::text, '|' order by id::text)) from public.appointments x union all
select 'receipts', count(*), md5(string_agg((to_jsonb(x) - 'branch_id')::text, '|' order by id::text)) from public.receipts x union all
select 'receipt_line_items', count(*), md5(string_agg((to_jsonb(x) - 'branch_id')::text, '|' order by id::text)) from public.receipt_line_items x union all
select 'payments', count(*), md5(string_agg((to_jsonb(x) - 'branch_id')::text, '|' order by id::text)) from public.payments x union all
select 'invitations', count(*), md5(string_agg((to_jsonb(x) - 'branch_id')::text, '|' order by id::text)) from public.invitations x union all
select 'customers', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.customers x union all
select 'loyalty_transactions', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by id::text)) from public.loyalty_transactions x;
select b.t, b.n as before_rows, a.n as after_rows, case when b.n = a.n and b.d = a.d then 'IDENTICAL' else 'DIFFERENT' end as result from qa.snap_before b join qa.snap_after a using (t) order by 1;
select 'rows with no branch' as check, (select count(*) from receipts where branch_id is null) + (select count(*) from appointments where branch_id is null) + (select count(*) from payments where branch_id is null) + (select count(*) from team_members where branch_id is null) + (select count(*) from receipt_line_items where branch_id is null) as n;
select 'branches' as check, string_agg(s.name||'/'||b.name||'/default='||b.is_default, '; ') as v from branches b join salons s on s.id = b.salon_id;
select 'logins' as check, string_agg(p.email||':'||coalesce(b.name,'ALL'), '; ') as v from profiles p left join branches b on b.id=p.branch_id;
