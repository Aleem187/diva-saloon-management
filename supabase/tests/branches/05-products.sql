-- Retail products (migration 20261112000048): stock, mixed receipts, voids, reports,
-- and that products earn no commission. Runs after 04 in the same database (salon B).
do $$
declare
  owner_b uuid; sb uuid; cust uuid; svc uuid; m1 uuid; m2 uuid; m3 uuid;
  p1 uuid; p2 uuid; rid uuid; rid2 uuid; err text; ap uuid; period uuid;
  svc_price numeric; n int; c1 numeric; c2 numeric;
  t0 timestamptz := date_trunc('day', now()) + interval '12 days' + interval '9 hours';
  lines jsonb;
begin
  select id into owner_b from auth.users where email='owner-b@qa.test';
  select salon_id into sb from profiles where id = owner_b;
  select id into cust from customers where salon_id = sb limit 1;
  select id, price into svc, svc_price from services where salon_id = sb limit 1;
  select id into m1 from team_members where salon_id = sb and full_name = 'Sup Lead 1';
  select id into m2 from team_members where salon_id = sb and full_name = 'Sup Lead 2';
  select id into m3 from team_members where salon_id = sb and full_name = 'Sup Helper 3';
  update services set commission_basis = 'percentage', commission_rate = 0.10 where id = svc;
  delete from staff_compensation where staff_id in (m1, m2, m3);

  perform qa.act(owner_b);
  insert into products (salon_id, name, sku, category, price, stock_quantity, low_stock_threshold)
    values (sb, 'Argan Oil', 'ARG-1', 'Hair care', 25, 5, 2) returning id into p1;
  insert into products (salon_id, name, sku, category, price, stock_quantity)
    values (sb, 'Comb', '', 'Tools', 4.50, 10) returning id into p2;
  err := qa.attempt(format($f$insert into products (salon_id, name, sku, price) values (%L, 'Dup', 'arg-1', 1)$f$, sb));
  perform qa.t('products: a SKU is unique within the salon (case-insensitive)', err is not null, coalesce(err,'no error'));
  err := qa.attempt(format($f$update products set stock_quantity = -1 where id = %L$f$, p1));
  perform qa.t('products: stock cannot be set below zero', err is not null, coalesce(err,'no error'));

  -- a sale with a service and two products
  rid := create_receipt(cust, 'cash', 0,0,0, null, '',
    jsonb_build_array(
      jsonb_build_object('service_id', svc, 'staff_id', m1, 'quantity', 1),
      jsonb_build_object('product_id', p1, 'quantity', 2),
      jsonb_build_object('product_id', p2, 'quantity', 1)));
  perform qa.admin();
  perform qa.t('products: a mixed receipt has a service line and product lines',
    (select count(*) from receipt_line_items where receipt_id = rid and item_type = 'service') = 1
    and (select count(*) from receipt_line_items where receipt_id = rid and item_type = 'product') = 2);
  perform qa.t('products: the receipt total is services plus products, priced by the catalogue',
    (select total from receipts where id = rid) = svc_price + 25*2 + 4.50, (select total::text from receipts where id = rid));
  perform qa.t('products: product lines carry no team member',
    (select count(*) from receipt_line_items where receipt_id = rid and item_type = 'product' and staff_id is not null) = 0);
  perform qa.t('products: stock was taken', (select stock_quantity from products where id = p1) = 3 and (select stock_quantity from products where id = p2) = 9);

  -- oversell refused whole
  perform qa.act(owner_b);
  err := qa.attempt(format($f$select create_receipt(%L,'cash',0,0,0,null,'', '[{"product_id":"%s","quantity":1},{"product_id":"%s","quantity":4}]'::jsonb)$f$, cust, p2, p1));
  perform qa.admin();
  perform qa.t('products: selling more than is in stock is refused', err ilike '%not enough%', coalesce(err,'no error'));
  perform qa.t('products: a refused sale leaves stock untouched', (select stock_quantity from products where id = p1) = 3 and (select stock_quantity from products where id = p2) = 9);

  -- products only
  perform qa.act(owner_b);
  rid2 := create_receipt(cust, 'card', 0,0,0, null, '', jsonb_build_array(jsonb_build_object('product_id', p2, 'quantity', 2)));
  perform qa.admin();
  perform qa.t('products: a products-only receipt works', (select total from receipts where id = rid2) = 9.00 and (select count(*) from receipt_line_items where receipt_id = rid2) = 1);

  -- reports
  perform qa.act(owner_b);
  perform qa.t('reports: service sales and product sales are separate and combine',
    (select revenue from report_sales_split(current_date - 1, current_date + 1) where kind = 'service') >= svc_price
    and (select revenue from report_sales_split(current_date - 1, current_date + 1) where kind = 'product') = 25*2 + 4.50 + 9.00
    and (select revenue from report_sales_split(current_date - 1, current_date + 1) where kind = 'combined')
      = (select sum(revenue) from report_sales_split(current_date - 1, current_date + 1) where kind <> 'combined'),
    (select string_agg(kind||'='||revenue, ', ') from report_sales_split(current_date - 1, current_date + 1)));
  perform qa.t('reports: by-service leaves products out', (select count(*) from report_revenue_by_service(current_date - 1, current_date + 1) where service_name in ('Argan Oil','Comb')) = 0);
  perform qa.t('reports: by-staff has no row for product lines', (select count(*) from report_revenue_by_staff(current_date - 1, current_date + 1) where staff_id is null) = 0);
  perform qa.t('reports: products report lists them', (select quantity from report_revenue_by_product(current_date - 1, current_date + 1) where product_name = 'Comb') = 3);
  perform qa.admin();

  -- void returns stock
  perform qa.act(owner_b);
  perform void_receipt(rid2, 'test');
  perform qa.admin();
  perform qa.t('products: stock after void is exactly restored', (select stock_quantity from products where id = p2) = 9);
  perform qa.act(owner_b);
  perform qa.t('reports: a voided sale drops out of product sales', (select revenue from report_sales_split(current_date - 1, current_date + 1) where kind = 'product') = 25*2 + 4.50);
  perform qa.admin();

  -- commission: none on products, for the lead or for support staff
  lines := jsonb_build_array(jsonb_build_object('service_id', svc, 'quantity', 1));
  perform qa.act(owner_b);
  ap := create_appointment(cust, null, null, m2, t0, '', false, 0, null, lines);
  perform set_appointment_support(ap, array[m3]);
  perform create_receipt(cust, 'cash', 0,0,0, null, '',
    jsonb_build_array(jsonb_build_object('service_id', svc, 'staff_id', m2, 'quantity', 1),
                      jsonb_build_object('product_id', p1, 'quantity', 1)),
    null, null, ap);
  perform qa.admin();
  delete from payroll_periods where salon_id = sb;   -- test 04's period overlaps today
  perform qa.act(owner_b);
  period := generate_payroll_period(current_date - 1, current_date + 1, 'products test');
  perform qa.admin();
  select commission_amount into c1 from payroll_entries where period_id = period and staff_id = m2;
  select commission_amount into c2 from payroll_entries where period_id = period and staff_id = m3;
  perform qa.t('payroll: the lead earns commission on the service only, not the product', c1 = round(svc_price * 0.10, 2), 'lead '||coalesce(c1::text,'none')||' expected '||round(svc_price * 0.10, 2));
  perform qa.t('payroll: support staff earn no commission on the product either', c2 = c1, 'support '||coalesce(c2::text,'none'));
end $$;

select case when ok then 'PASS' else 'FAIL' end as result, name, detail from qa.res where name like 'products:%' or name like 'reports:%' or name like 'payroll:%' order by n;
