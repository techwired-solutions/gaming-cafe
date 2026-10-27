\set ON_ERROR_STOP on
do $$ begin assert current_database()='inventory_schema_test','Use isolated test database';end $$;
\ir ../supabase/migrations/20261027_accounting_admin.sql
\ir ../supabase/migrations/20261027_accounting_admin.sql
begin;
insert into public.staff(id,name,username,password_hash,password_salt,role,active) values
('00000000-0000-0000-0000-000000009801','Accounting edit admin','accounting-edit-admin','test','test','admin',true),
('00000000-0000-0000-0000-000000009802','Accounting edit staff','accounting-edit-staff','test','test','staff',true);
do $$
<<suite>>
declare actor uuid:='00000000-0000-0000-0000-000000009801';staff uuid:='00000000-0000-0000-0000-000000009802';e uuid;p uuid:=gen_random_uuid();c uuid;move uuid;repayment uuid;partner uuid;request uuid;expected jsonb;item jsonb;d date:=(now() at time zone 'Asia/Kathmandu')::date;before_count int;snapshot jsonb;
begin
 perform public.accounting_reconcile(actor,gen_random_uuid(),1000,2000,'Admin edit test opening');
 e:=public.accounting_record_expense(staff,p,jsonb_build_object('title','Repair invoice','category','Maintenance','amount',1000,'paid_amount',200,'kind','operating','date',d,'account','cash'));
 select to_jsonb(x) into expected from public.expenses x where id=e;
 item:=jsonb_build_object('title','Equipment invoice corrected','vendor','Hardware vendor','category','Equipment','kind','capital','amount',1200,'date',d-1,'due_date',d+7,'notes','Correct supplier receipt');request:=gen_random_uuid();
 begin perform public.accounting_admin_save(staff,request,'expense',e,expected,item,'Not an admin');raise exception 'Expected staff denial';exception when others then assert SQLERRM like 'An active admin%';end;
 perform public.accounting_admin_save(actor,request,'expense',e,expected,item,'Correct amount and classification');
 perform public.accounting_admin_save(actor,request,'expense',e,expected,item,'Correct amount and classification');
 assert (select count(*)=1 from public.accounting_corrections where id=request),'Retries are idempotent';
 assert (select sum(debit-credit)=1200 from public.accounting_lines where account='capital_asset');
 assert (select coalesce(sum(debit-credit),0)=0 from public.accounting_lines where account='operating_expense');
 assert exists(select 1 from public.accounting_entries where source_type='expenses' and source_id=e::text and business_date=d-1),'Correction uses invoice date';
 begin perform public.accounting_admin_save(actor,gen_random_uuid(),'expense',e,expected,item,'Stale edit');raise exception 'Expected stale rejection';exception when others then assert SQLERRM like 'This record changed%';end;
 select to_jsonb(x) into expected from public.accounting_expense_payments x where id=p;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'payment',p,expected,jsonb_build_object('amount',300,'account','bank','date',d-2,'reference','Bank statement','owner',''),'Correct amount and paying account');
 assert (select sum(debit-credit)=1000 from public.accounting_lines where account='cash');
 assert (select sum(debit-credit)=1700 from public.accounting_lines where account='bank');
 assert (select amount=300 and account='bank' from public.accounting_expense_payments where id=p);
 select to_jsonb(x) into expected from public.expenses x where id=e;
 begin perform public.accounting_admin_save(actor,gen_random_uuid(),'expense',e,expected,item||jsonb_build_object('amount',100),'Cannot understate paid invoice');raise exception 'Expected payment guard';exception when others then assert SQLERRM like 'Invoice total cannot be below%';end;
 select to_jsonb(x) into expected from public.accounting_expense_payments x where id=p;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'payment',p,expected,jsonb_build_object('void',true),'Duplicate payment removed');
 assert (select sum(debit-credit)=2000 from public.accounting_lines where account='bank');
 assert (select voided_at is not null from public.accounting_expense_payments where id=p);
 select to_jsonb(x) into expected from public.expenses x where id=e;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'expense',e,expected,jsonb_build_object('void',true),'Incorrect invoice voided');
 assert (select sum(debit-credit)=0 from public.accounting_lines where account='capital_asset');
 c:=gen_random_uuid();
 item:=jsonb_build_object('partner','Partner Alpha','amount',10000,'account','bank','date',d-100,'historical',true,'notes','Old register');
 perform public.accounting_admin_save(actor,gen_random_uuid(),'capital',c,null,item,'Add historical capital');
 assert (select sum(debit-credit)=2000 from public.accounting_lines where account='bank'),'Historical receipt is not new bank money';
 select to_jsonb(x) into expected from public.capital_contributions x where id=c;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'capital',c,expected,item||jsonb_build_object('amount',12000,'account','cash'),'Correct historical contribution');
 assert (select sum(debit-credit)=1000 from public.accounting_lines where account='cash'),'Historical account label cannot create cash';
 select id,to_jsonb(x) into partner,expected from public.accounting_partners x where name='Partner Alpha';
 perform public.accounting_admin_save(actor,gen_random_uuid(),'partner',partner,expected,jsonb_build_object('name','Partner Alpha Renamed','committed',50000,'notes','Agreed contribution'),'Set shared commitment and rename');
 assert (select partner_name='Partner Alpha Renamed' from public.capital_contributions where id=c);
 assert (select committed_amount=50000 from public.accounting_partners where id=partner);
 select to_jsonb(x) into expected from public.capital_contributions x where id=c;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'capital',c,expected,jsonb_build_object('void',true),'Void wrong historical entry');
 assert (select sum(debit-credit)=1000 from public.accounting_lines where account='cash');
 c:=gen_random_uuid();item:=jsonb_build_object('partner','Partner Beta','amount',1000,'account','cash','date',d,'historical',false,'notes','Receipt');
 perform public.accounting_admin_save(actor,gen_random_uuid(),'capital',c,null,item,'Record actual receipt');
 assert (select sum(debit-credit)=2000 from public.accounting_lines where account='cash');
 select to_jsonb(x) into expected from public.capital_contributions x where id=c;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'capital',c,expected,item||jsonb_build_object('amount',1500,'account','bank'),'Correct actual receipt account and value');
 assert (select sum(debit-credit)=1000 from public.accounting_lines where account='cash');
 assert (select sum(debit-credit)=3500 from public.accounting_lines where account='bank');
 select to_jsonb(x) into expected from public.capital_contributions x where id=c;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'capital',c,expected,jsonb_build_object('void',true),'Void duplicate receipt');
 move:=public.accounting_record_transaction(actor,gen_random_uuid(),'capital','cash','cash',200,'Loan owner',d,'Funding');
 select to_jsonb(x) into expected from public.accounting_transactions x where id=move;
 item:=jsonb_build_object('kind','owner_loan','from','cash','to','bank','amount',300,'party','Loan owner','date',d,'reference','Loan classification');
 perform public.accounting_admin_save(actor,gen_random_uuid(),'transaction',move,expected,item,'Funding is a loan, not equity');
 assert (select sum(credit-debit)=300 from public.accounting_lines where account='owner_loan' and party='Loan owner');
 repayment:=public.accounting_record_transaction(actor,gen_random_uuid(),'loan_repayment','bank','bank',100,'Loan owner',d,'Repayment');
 select to_jsonb(x) into expected from public.accounting_transactions x where id=move;
 begin perform public.accounting_admin_save(actor,gen_random_uuid(),'transaction',move,expected,item||jsonb_build_object('amount',50),'Invalid reduction below repayment');raise exception 'Expected repayment guard';exception when others then assert SQLERRM like 'This correction would overpay%';end;
 select to_jsonb(x) into expected from public.accounting_transactions x where id=repayment;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'transaction',repayment,expected,jsonb_build_object('void',true),'Void repayment correction');
 select to_jsonb(x) into expected from public.accounting_transactions x where id=move;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'transaction',move,expected,jsonb_build_object('void',true),'Void wrong loan');
 assert (select sum(debit-credit)=1000 from public.accounting_lines where account='cash');
 assert (select sum(debit-credit)=2000 from public.accounting_lines where account='bank');
 -- Historical payment account corrections retain opening counted balances.
 insert into public.expenses(title,category,amount,payment_source,type,created_at,date,expense_date) values('Legacy test','Other',100,'cafe_revenue','ongoing',now()-interval '100 days',d-100,now()-interval '100 days') returning id into e;
 select id into p from public.accounting_expense_payments where expense_id=e;
 update public.accounting_expense_payments set accounting_historical=true where id=p;
 select to_jsonb(x) into expected from public.accounting_expense_payments x where id=p;
 perform public.accounting_admin_save(actor,gen_random_uuid(),'payment',p,expected,jsonb_build_object('amount',100,'account','bank','date',d-100,'reference','Historical bank reference','owner',''),'Classify historical payment');
 assert (select sum(debit-credit)=2000 from public.accounting_lines where account='bank');
 assert not exists(select entry_id from public.accounting_lines group by entry_id having sum(debit-credit)<>0),'All correction entries are balanced';
 move:=gen_random_uuid();insert into public.tournaments(id,name) values(move,'Statement pagination test');
 insert into public.tournament_players(tournament_id,player_name,phone) select move,'Export player '||x,'9800000000' from generate_series(1,1100) x;
 snapshot:=public.accounting_statement_data(actor);assert jsonb_array_length(snapshot->'tournament_players')>=1100,'Export cannot truncate at the default API row limit';
 assert jsonb_typeof(snapshot->'loyalty_visits')='array' and jsonb_typeof(snapshot->'accounting_corrections')='array';
 begin perform public.accounting_statement_data(staff);raise exception 'Expected staff export denial';exception when others then assert SQLERRM like 'An active admin%';end;
 assert not has_table_privilege('anon','public.accounting_corrections','INSERT');
 assert not has_function_privilege('anon','public.accounting_edit_capture()','EXECUTE');
 assert exists(select 1 from public.accounting_corrections where before_data is not null and after_data is not null and staff_name='Accounting edit admin');
end $$;
rollback;
\echo Passed: admin invoice/payment/classification corrections, audit/retry/stale guards, historical/current capital, shared commitments, partner rename and loan repayment protection.
