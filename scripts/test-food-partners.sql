\set ON_ERROR_STOP on
do $$ begin assert current_database()='inventory_schema_test','Use isolated inventory_schema_test database'; end $$;
\ir ../supabase/migrations/20261026_food_partner_bills.sql
\ir ../supabase/migrations/20261026_food_partner_bills.sql
begin;
insert into public.staff(id,name,username,password_hash,password_salt,role,active) values
 ('00000000-0000-0000-0000-000000008001','Food test admin','food-test-admin','test','test','admin',true),
 ('00000000-0000-0000-0000-000000008002','Food test staff','food-test-staff','test','test','staff',true);
insert into public.sessions(station_name,customer_name,customer_phone,start_time,food_items,status) values('Counter / Cafe','Food test','—','2026-10-26T10:00:00+05:45','[{"name":"Milk Tea","supplier":"bros_burger","qty":2,"price":40}]','Completed');
do $$
declare a uuid:='00000000-0000-0000-0000-000000008001'; s uuid:='00000000-0000-0000-0000-000000008002';
 b uuid; p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); v timestamptz; expense uuid; old_expense uuid;
begin
 b:=public.food_partner_save_bill(a,'bros_burger','2026-10-26',50,'Tea bill 1','80 collected, 50 bill',null);
 assert (select amount=50 and order_gross_snapshot>=80 from public.food_partner_bills where id=b);
 select updated_at into v from public.food_partner_bills where id=b;
 begin perform public.food_partner_save_bill(s,'bardali','2026-10-26',100,'','',null);raise exception 'Expected admin check';exception when others then assert SQLERRM like 'An active admin%';end;
 begin perform public.food_partner_save_bill(a,'bros_burger','2026-10-26',60,'','',null);raise exception 'Expected stale bill check';exception when others then assert SQLERRM like 'This bill changed%';end;
 perform public.food_partner_record_payment(a,b,p,20,'Cash','2026-10-26','Part payment');
 perform public.food_partner_record_payment(a,b,p,20,'Cash','2026-10-26','Part payment');
 assert (select count(*)=1 from public.food_partner_payments where id=p);
 assert (select sum(amount)=20 from public.food_partner_payments where bill_id=b and voided_at is null);
 select expense_id into expense from public.food_partner_payments where id=p;
 assert (select amount=20 and payment_source='cafe_revenue' from public.expenses where id=expense);
 begin perform public.food_partner_record_payment(a,b,gen_random_uuid(),40,'Cash','2026-10-26','Overpay');raise exception 'Expected overpay check';exception when others then assert SQLERRM like 'Payment exceeds%';end;
 begin perform public.food_partner_save_bill(a,'bros_burger','2026-10-26',10,'','',v);raise exception 'Expected paid minimum check';exception when others then assert SQLERRM like 'Bill cannot be less%';end;
 begin delete from public.expenses where id=expense;raise exception 'Expected expense guard';exception when others then assert SQLERRM like 'This expense belongs%';end;
 begin update public.expenses set amount=1 where id=expense;raise exception 'Expected expense guard';exception when others then assert SQLERRM like 'This expense belongs%';end;
 perform public.food_partner_record_payment(a,b,q,30,'Online / QR','2026-10-27','Balance');
 assert (select sum(amount)=50 from public.food_partner_payments where bill_id=b and voided_at is null);
 perform public.food_partner_void_payment(a,p,'Incorrect amount');
 assert not exists(select 1 from public.expenses where id=expense);
 assert (select voided_at is not null and expense_id is null from public.food_partner_payments where id=p);
 insert into public.expenses(title,category,amount,payment_source,notes) values('Legacy Bro payout','Partner Payout',20,'cafe_revenue','[Settlement: bros_burger] old payment') returning id into old_expense;
 perform public.food_partner_record_payment(a,b,gen_random_uuid(),20,'Cash','2026-10-26','Linked old payout',old_expense);
 assert (select count(*)=1 from public.expenses where id=old_expense);
 assert (select sum(amount)=50 from public.food_partner_payments where bill_id=b and voided_at is null);
 assert not has_table_privilege('anon','public.food_partner_payments','INSERT');
 assert not has_table_privilege('anon','public.food_partner_bills','UPDATE');
 raise notice 'PASS: bill creation/revisions, admin check, stale-write protection, partial/full payments, retry idempotency, overpayment prevention, expense protection, void corrections and historical payout linking';
end $$;
rollback;
