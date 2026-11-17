\set ON_ERROR_STOP on
do $$ begin assert current_database()='inventory_schema_test','Use isolated inventory_schema_test database';end $$;
\ir ../supabase/migrations/20261117_record_archives.sql
\ir ../supabase/migrations/20261117_record_archives.sql
begin;
insert into public.staff(id,name,username,password_hash,password_salt,role,active) values
('00000000-0000-0000-0000-000000007701','Archive admin','archive-admin','test','test','admin',true),
('00000000-0000-0000-0000-000000007702','Archive staff','archive-staff','test','test','staff',true);
do $$
declare actor uuid:='00000000-0000-0000-0000-000000007701';worker uuid:='00000000-0000-0000-0000-000000007702';
 session uuid:=gen_random_uuid();unpaid uuid:=gen_random_uuid();active_session uuid:=gen_random_uuid();cancelled uuid:=gen_random_uuid();item uuid;menu uuid;bill uuid;expense uuid;plan jsonb;result jsonb;before_loyalty jsonb;before_journal jsonb;daily jsonb;cutoff date;d date;job uuid;paid_session uuid;next_plan jsonb;
begin
 select max(start_date)-1 into cutoff from public.archive_nepali_months where start_date<=(now() at time zone 'Asia/Kathmandu')::date;
 d:=cutoff-10;
 insert into public.menu_items(name,price,supplier) values('Archive test drink',30,'bros_burger') returning id into menu;
 item:=public.inventory_save_item(actor,jsonb_build_object('name','Archive test drink','opening_stock',100,'menu_item_id',menu,'unit_cost',10));
 insert into public.sessions(id,station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,amount,paid,paid_amount,payment_method,cash_amount,food_total,food_items,status)
 values(session,'Station 1','Archive customer','9877777701',d::timestamp at time zone 'Asia/Kathmandu',(d::timestamp+interval '12 hours') at time zone 'Asia/Kathmandu',720,100,1260,true,1260,'Cash',1260,60,jsonb_build_array(jsonb_build_object('id',menu,'name','Archive test drink','supplier','bros_burger','qty',2,'price',30,'menu_price',30)),'Completed');
 insert into public.loyalty_rewards(session_id,phone,station_name,discount,staff_name,checkout_payload) values(session,'9877777701','Station 1',100,'Archive admin','{"retained":"only in download"}');
 before_loyalty:=public.loyalty_balance('9877777701');
 assert (before_loyalty->>'stamps')::int=12;
 assert (before_loyalty->>'redeemed')::int=1;
 insert into public.sessions(id,station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,amount,status,paid) values
 (unpaid,'Station 2','Unpaid customer','9877777702',d::timestamp at time zone 'Asia/Kathmandu',(d::timestamp+interval '1 hour') at time zone 'Asia/Kathmandu',60,100,'Completed',false),
 (active_session,'Station 3','Active customer','9877777703',d::timestamp at time zone 'Asia/Kathmandu',(d::timestamp+interval '1 hour') at time zone 'Asia/Kathmandu',60,100,'Active',true),
 (cancelled,'Station 4','Cancelled customer','9877777704',d::timestamp at time zone 'Asia/Kathmandu',(d::timestamp+interval '1 hour') at time zone 'Asia/Kathmandu',60,100,'Cancelled',false);
 bill:=public.food_partner_save_bill(actor,'bros_burger',d,40,'Archive supplier bill','',null);
 expense:=public.accounting_record_expense(actor,gen_random_uuid(),jsonb_build_object('title','Unpaid archive expense','category','Rent','kind','operating','amount',100,'paid_amount',0,'date',d));
 insert into public.waiting_list(customer_name,customer_phone,status,created_at) values('Closed waiting','9877777701','Seated',d::timestamp),('Open waiting','9877777701','Waiting',d::timestamp);
 update public.inventory_movements set created_at=d::timestamp where item_id=item;
 select jsonb_agg(to_jsonb(x) order by business_date,account,party) into before_journal from(select e.business_date,l.account,l.party,sum(l.debit) debit,sum(l.credit) credit from public.accounting_lines l join public.accounting_entries e on e.id=l.entry_id group by 1,2,3)x;
 begin perform public.archive_prepare(worker,cutoff);raise exception 'Expected admin guard';exception when others then assert SQLERRM like 'An active admin%';end;
 begin perform public.archive_prepare(actor,(now() at time zone 'Asia/Kathmandu')::date);raise exception 'Expected cutoff guard';exception when others then assert SQLERRM like 'Choose a completed period%';end;
 plan:=public.archive_prepare(actor,cutoff);job:=(plan->>'job_id')::uuid;
 assert plan->'session_ids' ? session::text;
 assert plan->'session_ids' ? cancelled::text;
 assert not(plan->'session_ids' ? unpaid::text);
 assert not(plan->'session_ids' ? active_session::text);
 assert plan->'data' ? 'inventory_session_stock';
 daily:=jsonb_build_array(jsonb_build_object('business_date',d,'record_count',2,'gaming_minutes',780,'discounts',0,'cash',1260,'bank',0,'gross',1260,'food_total',60,'time_revenue',1200,'food',jsonb_build_array(jsonb_build_object('source','bros_burger','ordered',60,'collected',60,'qty',2,'menu_value',60))));
 begin perform public.archive_erase(actor,job,plan->>'snapshot_hash','CONFIRM',daily);raise exception 'Expected saved guard';exception when others then assert SQLERRM like 'Prepare and save%';end;
 perform public.archive_download_saved(actor,job,plan->>'snapshot_hash','archive-test.zip');
 begin perform public.archive_erase(actor,job,plan->>'snapshot_hash','confirm',daily);raise exception 'Expected confirmation guard';exception when others then assert SQLERRM like 'Type CONFIRM%';end;
 begin
  execute replace(pg_get_functiondef('public.inventory_track_session()'::regprocedure),'public.archive_is_cleanup()','false');
  perform public.archive_erase(actor,job,plan->>'snapshot_hash','CONFIRM',daily);raise exception 'Expected safeguard guard';
 exception when others then assert SQLERRM like 'Archive safeguards were replaced%';end;
 begin perform public.archive_erase(actor,job,plan->>'snapshot_hash','CONFIRM',jsonb_set(daily,'{0,cash}','1'));raise exception 'Expected payment summary guard';exception when others then assert SQLERRM like 'Summary payment and food totals%';end;
 begin perform public.archive_erase(actor,job,plan->>'snapshot_hash','CONFIRM','[]');raise exception 'Expected summary guard';exception when others then assert SQLERRM like 'Summary totals%';end;
 update public.waiting_list set notes='Changed after download' where customer_name='Closed waiting';
 begin perform public.archive_erase(actor,job,plan->>'snapshot_hash','CONFIRM',daily);raise exception 'Expected stale guard';exception when others then assert SQLERRM like 'Records changed%';end;
 assert exists(select 1 from public.sessions where id=session);
 plan:=public.archive_prepare(actor,cutoff);job:=(plan->>'job_id')::uuid;
 perform public.archive_download_saved(actor,job,plan->>'snapshot_hash','archive-test.zip');
 result:=public.archive_erase(actor,job,plan->>'snapshot_hash','CONFIRM',daily);
 assert (result->>'sessions')::int=2;
 assert not exists(select 1 from public.sessions where id in(session,cancelled));
 assert exists(select 1 from public.sessions where id=unpaid);
 assert exists(select 1 from public.sessions where id=active_session);
 assert exists(select 1 from public.expenses where id=expense);
 assert exists(select 1 from public.food_partner_bills where id=bill);
 assert (select quantity=98 from public.inventory_items where id=item),'Cleanup must never return sold stock';
 assert not exists(select 1 from public.inventory_movements where item_id=item);
 assert not exists(select 1 from public.inventory_session_stock where session_id=session);
 assert public.loyalty_balance('9877777701')=before_loyalty,'Stamps, progress, redeemed rewards and eligibility must be unchanged';
 assert (select session_id is null and voided_at is null and checkout_payload is null from public.loyalty_rewards where phone='9877777701');
 assert (select record_count=2 and gross=1260 from public.archive_daily where business_date=d);
 assert before_journal=(select jsonb_agg(to_jsonb(x) order by business_date,account,party) from(select e.business_date,l.account,l.party,sum(l.debit) debit,sum(l.credit) credit from public.accounting_lines l join public.accounting_entries e on e.id=l.entry_id group by 1,2,3)x),'Cleanup must preserve every day/account/party debit and credit';
 assert (result->>'journal_entries_compacted')::int>0;
 assert not exists(select 1 from public.accounting_entries where source_type='sessions' and source_id=session::text);
 assert not exists(select 1 from public.accounting_lines group by entry_id having sum(debit)<>sum(credit));
 assert not exists(select 1 from public.waiting_list where customer_name='Closed waiting');
 assert exists(select 1 from public.waiting_list where customer_name='Open waiting');
 assert not exists(select 1 from public.archive_cleanup_guard);
 assert public.archive_erase(actor,job,plan->>'snapshot_hash','CONFIRM',daily)=result,'Retry must not duplicate summaries';
 assert not has_table_privilege('anon','public.archive_cleanup_guard','INSERT');
 assert not has_table_privilege('anon','public.archive_daily','UPDATE');
 -- New visits on the same day accumulate rather than overwrite earlier summaries.
 paid_session:=gen_random_uuid();
 insert into public.sessions(id,station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,amount,paid,payment_method,cash_amount,status)
 values(paid_session,'Station 1','Later correction','9877777701',d::timestamp at time zone 'Asia/Kathmandu',(d::timestamp+interval '1 hour') at time zone 'Asia/Kathmandu',60,100,true,'Cash',100,'Completed');
 next_plan:=public.archive_prepare(actor,cutoff);
 daily:=jsonb_build_array(jsonb_build_object('business_date',d,'record_count',1,'gaming_minutes',60,'discounts',0,'cash',100,'bank',0,'gross',100,'food_total',0,'time_revenue',100,'food','[]'::jsonb));
 perform public.archive_download_saved(actor,(next_plan->>'job_id')::uuid,next_plan->>'snapshot_hash','archive-again.zip');
 perform public.archive_erase(actor,(next_plan->>'job_id')::uuid,next_plan->>'snapshot_hash','CONFIRM',daily);
 assert (select record_count=3 and gross=1360 from public.archive_daily where business_date=d);
 assert (select count(*)=count(distinct source_id) from public.accounting_entries where source_type='archive_sessions'),'Repeated cleanup merges each accounting date';
 assert not exists(select 1 from public.accounting_lines group by entry_id having sum(debit)<>sum(credit));
 assert (public.loyalty_balance('9877777701')->>'stamps')::int=13;
 -- A normal delete still returns stock and reverses accounting/loyalty, outside cleanup.
 insert into public.sessions(id,station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,amount,paid,status,food_items)
 values(gen_random_uuid(),'Station 1','Normal deletion','9877777705',d::timestamp at time zone 'Asia/Kathmandu',(d::timestamp+interval '1 hour') at time zone 'Asia/Kathmandu',60,130,true,'Completed',jsonb_build_array(jsonb_build_object('id',menu,'qty',1,'price',30))) returning id into paid_session;
 assert (select quantity=97 from public.inventory_items where id=item);
 delete from public.sessions where id=paid_session;
 assert (select quantity=98 from public.inventory_items where id=item);
 assert (public.loyalty_balance('9877777705')->>'stamps')::int=0;
 raise notice 'PASS: admin/cutoff/download/confirmation/stale guards; atomic cleanup, idempotency, repeated cleanup, stock, journals, unpaid work and loyalty preserved; ordinary deletion still reverses.';
end $$;
rollback;
