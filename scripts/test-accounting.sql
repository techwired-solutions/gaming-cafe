\set ON_ERROR_STOP on
do $$ begin assert current_database()='inventory_schema_test','Use the isolated inventory_schema_test database';end $$;
\ir ../supabase/migrations/20261027_accounting.sql
\ir ../supabase/migrations/20261027_accounting.sql
begin;
insert into public.staff(id,name,username,password_hash,password_salt,role,active) values
('00000000-0000-0000-0000-000000008901','Accounting admin','accounting-test-admin','test','test','admin',true),
('00000000-0000-0000-0000-000000008902','Accounting staff','accounting-test-staff','test','test','staff',true);
do $$
declare a uuid:='00000000-0000-0000-0000-000000008901'; s uuid:='00000000-0000-0000-0000-000000008902';
 e uuid; pending uuid; b uuid; payment uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); count_request uuid:=gen_random_uuid(); sale uuid:=gen_random_uuid(); debtor uuid:=gen_random_uuid();
 v_today date:=(now() at time zone 'Asia/Kathmandu')::date; payload jsonb; n int; cash numeric; bank numeric;
begin
 perform public.accounting_reconcile(a,count_request,1000,2000,'Opening counted balances');
 perform public.accounting_reconcile(a,count_request,1000,2000,'Opening counted balances');
 assert (select count(*)=1 from public.accounting_balance_checks where id=count_request);
 begin perform public.accounting_reconcile(s,gen_random_uuid(),0,0,'Not allowed');raise exception 'Expected admin-only balances';exception when others then assert SQLERRM like 'An active admin%';end;
 payload:=jsonb_build_object('title','Salary test','category','Salaries & Wages','amount',1000,'paid_amount',200,'account','cash','kind','operating','date',v_today,'due_date',v_today+7);
 e:=public.accounting_record_expense(s,request,payload);
 perform public.accounting_record_expense(s,request,payload);
 assert (select sum(amount)=200 from public.accounting_expense_payments where expense_id=e);
 assert (select sum(debit-credit)=800 from public.accounting_lines where account='cash');
 assert (select sum(credit-debit)=800 from public.accounting_lines where account='expense_payable');
 payment:=gen_random_uuid();perform public.accounting_pay_expense(s,e,payment,400,'bank',v_today,'','Bank part payment');
 perform public.accounting_pay_expense(s,e,payment,400,'bank',v_today,'','Bank part payment');
 assert (select sum(debit-credit)=1600 from public.accounting_lines where account='bank');
 perform public.accounting_pay_expense(s,e,gen_random_uuid(),400,'owner',v_today,'Sujan','Owner paid vendor');
 assert (select sum(credit-debit)=400 from public.accounting_lines where account='owner_payable' and party='Sujan');
 assert (select sum(credit-debit)=0 from public.accounting_lines where account='expense_payable');
 perform public.accounting_record_transaction(a,gen_random_uuid(),'owner_reimbursement','bank','cash',200,'Sujan',v_today,'Reimburse part of personal expense');
 assert (select sum(credit-debit)=200 from public.accounting_lines where account='owner_payable' and party='Sujan');
 perform public.accounting_record_transaction(a,gen_random_uuid(),'owner_loan','cash','bank',500,'Sujan',v_today,'Working capital loan');
 perform public.accounting_record_transaction(a,gen_random_uuid(),'capital','bank','cash',300,'Sujan',v_today,'Owner equity contribution');
 perform public.accounting_record_transaction(a,gen_random_uuid(),'transfer','cash','bank',100,'',v_today,'Deposit counter cash');
 assert (select sum(debit-credit)=1000 from public.accounting_lines where account='cash');
 assert (select sum(debit-credit)=2000 from public.accounting_lines where account='bank');
 insert into public.sessions(id,station_name,customer_name,customer_phone,status,amount,food_total,paid,paid_amount,payment_method,cash_amount) values(sale,'Counter / Cafe','Tea sale','—','Completed',80,80,true,80,'Cash',80);
 assert (select sum(debit-credit)=1080 from public.accounting_lines where account='cash');
 insert into public.sessions(id,station_name,customer_name,customer_phone,status,amount,paid,paid_amount,payment_method) values(debtor,'Station 1','Debtor','—','Completed',200,false,0,null);
 assert (select sum(debit-credit)=200 from public.accounting_lines where account='receivables');
 update public.sessions set paid_amount=50,online_amount=50,payment_method='Online' where id=debtor;
 assert (select sum(debit-credit)=150 from public.accounting_lines where account='receivables');
 assert (select sum(debit-credit)=2050 from public.accounting_lines where account='bank');
 select count(*) into n from public.accounting_entries;
 update public.sessions set notes='Unrelated edit' where id=debtor;
 assert (select count(*)=n from public.accounting_entries),'Unchanged financial state must not post twice';
 b:=public.food_partner_save_bill(a,'accounting_test_supplier',v_today,50,'Supplier bill','Actual bill',null);
 perform public.food_partner_record_payment(a,b,gen_random_uuid(),50,'Cash',v_today,'Supplier paid');
 assert (select sum(debit-credit)=1030 from public.accounting_lines where account='cash');
 assert (select sum(credit-debit)=0 from public.accounting_lines where account='supplier_payable');
 assert (select sum(debit-credit)=50 from public.accounting_lines where account='supplier_cost');
 assert (select sum(debit-credit)=1000 from public.accounting_lines where account='operating_expense'),'Supplier payout must not count as another operating expense';
 pending:=public.accounting_record_expense(s,gen_random_uuid(),jsonb_build_object('title','Unpaid maintenance','category','Repairs & Maintenance','amount',600,'paid_amount',0,'kind','operating','date',v_today,'due_date',v_today+3));
 assert (select sum(credit-debit)=600 from public.accounting_lines where account='expense_payable');
 perform public.accounting_void_expense(a,pending,'Duplicate invoice');
 assert (select sum(credit-debit)=0 from public.accounting_lines where account='expense_payable');
 begin perform public.accounting_pay_expense(s,e,gen_random_uuid(),1,'cash',v_today,'','Overpayment');raise exception 'Expected overpayment guard';exception when others then assert SQLERRM like 'Payment exceeds%';end;
 begin perform public.accounting_record_expense(s,gen_random_uuid(),jsonb_build_object('title','Asset','category','Equipment','amount',500,'paid_amount',0,'kind','capital','date',v_today));raise exception 'Expected admin asset guard';exception when others then assert SQLERRM like 'Only admins%';end;
 begin perform public.accounting_record_transaction(a,gen_random_uuid(),'owner_reimbursement','cash','bank',201,'Sujan',v_today,'Too much');raise exception 'Expected owner payable guard';exception when others then assert SQLERRM like 'Payment exceeds%';end;
 perform public.accounting_record_expense(a,gen_random_uuid(),jsonb_build_object('title','Asset purchase','category','Equipment','amount',500,'paid_amount',500,'account','bank','kind','capital','date',v_today));
 assert (select sum(debit-credit)=500 from public.accounting_lines where account='capital_asset');
 assert (select sum(debit-credit)=1000 from public.accounting_lines where account='operating_expense');
 insert into public.expenses(title,category,amount,payment_source,paid_by_partner_name,reimbursement_status) values('Legacy reimbursed purchase','Supplies',20,'partner_personal','Legacy owner','reimbursed');
 assert coalesce((select sum(credit-debit) from public.accounting_lines where account='owner_payable' and party='Legacy owner'),0)=0,'Already reimbursed legacy purchases must not create a new owner payable';
 insert into public.expenses(title,category,amount,payment_source) values('Older client paid expense','Supplies',15,'cafe_revenue');
 assert (select sum(credit-debit)=0 from public.accounting_lines where account='expense_payable'),'Legacy paid entries must not become new unpaid bills';
 insert into public.sessions(id,station_name,customer_name,customer_phone,status,amount,paid,paid_amount,payment_method,cash_amount) values(gen_random_uuid(),'Station booked','Advance customer','—','Booked',300,false,100,'Cash',100) returning id into debtor;
 assert (select sum(credit-debit)=100 from public.accounting_lines where account='customer_advances'),'Booking deposits are liabilities, not earned sales';
 update public.sessions set status='Active' where id=debtor;
 assert (select sum(credit-debit)=0 from public.accounting_lines where account='customer_advances');
 assert not exists(select entry_id from public.accounting_lines group by entry_id having sum(debit-credit)<>0),'Every journal entry must balance';
 assert not has_table_privilege('anon','public.accounting_lines','INSERT');
 assert not has_function_privilege('anon','public.accounting_post_state(text,text,text,jsonb,date)','EXECUTE');
 assert not has_table_privilege('anon','public.accounting_expense_payments','UPDATE');
 raise notice 'PASS: counted balances, staff expenses, split-account payments, owner liabilities/reimbursements, loans, equity, transfers, receivables, supplier payouts, capital expenditure, corrections, idempotency and balanced journals';
end $$;
rollback;
