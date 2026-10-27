\set ON_ERROR_STOP on
do $$ begin assert current_database()='inventory_schema_test','Use isolated local test database';end $$;
\ir ../supabase/migrations/20261027_loyalty.sql
\ir ../supabase/migrations/20261027_loyalty.sql
begin;
insert into public.staff(id,name,username,password_hash,password_salt,role,active) values ('00000000-0000-0000-0000-000000009701','Loyalty staff','loyalty-test-staff','test','test','staff',true);
do $$
<<test_loyalty>>
declare r jsonb;session_id uuid;other_id uuid;history_id uuid;payload jsonb;result jsonb;phone text:='9800009701';actor uuid:='00000000-0000-0000-0000-000000009701';n integer;quote jsonb;
begin
 assert public.loyalty_phone('+977 980-000-9701')=phone;
 assert public.loyalty_phone('00977 9800009701')=phone;
 assert public.loyalty_phone('Internal')='';
 r:=jsonb_build_object('station_name','Station 1','start_time','2026-10-20T10:00:00+05:45','duration_minutes',60,'rate',100);
 assert public.loyalty_seconds(r,'2026-10-20T10:59:59+05:45')=3599;
 assert public.loyalty_seconds(r,'2026-10-20T11:00:00+05:45')=3600;
 assert public.loyalty_seconds(r,'2026-10-20T13:00:00+05:45')=3600,'Future/unplayed booked time is excluded';
 assert floor(public.loyalty_seconds(r||jsonb_build_object('duration_minutes',119),'2026-10-20T13:00:00+05:45')/3600.0)=1;
 assert floor(public.loyalty_seconds(r||jsonb_build_object('duration_minutes',120),'2026-10-20T13:00:00+05:45')/3600.0)=2;
 r:=r||jsonb_build_object('extra_stations',jsonb_build_array(jsonb_build_object('station','Simulator','start_time','10:00','end_time','11:00','duration_minutes',60,'rate',200)));
 assert public.loyalty_seconds(r,'2026-10-20T12:00:00+05:45')=3600,'Concurrent stations count once';
 r:=r||jsonb_build_object('extra_stations',jsonb_build_array(jsonb_build_object('station','Simulator','start_time','11:30','end_time','12:30','duration_minutes',60,'rate',200)));
 assert public.loyalty_seconds(r,'2026-10-20T13:00:00+05:45')=7200,'Gaps between stations do not earn time';
 r:=r-'extra_stations'||jsonb_build_object('duration_minutes',90,'loyalty_pauses',jsonb_build_array(jsonb_build_object('station','Station 1','from','2026-10-20T10:30:00+05:45','to','2026-10-20T11:00:00+05:45')));
 assert public.loyalty_seconds(r,'2026-10-20T13:00:00+05:45')=3600,'Completed pause excluded';
 r:=r-'loyalty_pauses'||jsonb_build_object('duration_minutes',120,'notes','[Station Paused: Station 1 | At: 2026-10-20T11:00:00+05:45 | RemainingMs: 3600000 | Reason: Break]');
 assert public.loyalty_seconds(r,'2026-10-20T13:00:00+05:45')=3600,'Open pause excluded';
 r:=r||jsonb_build_object('notes','[Station Completed: Station 1 | At: 2026-10-20T10:30:00+05:45]');
 assert public.loyalty_seconds(r,'2026-10-20T13:00:00+05:45')=1800,'Station completion stops earning';
 r:=r||jsonb_build_object('notes','','duration_minutes',60,'end_time','2026-10-20T12:00:00+05:45');
 assert public.loyalty_seconds(r,'2026-10-20T13:00:00+05:45')=3600,'Old extended end is not extra play';
 r:=jsonb_build_object('station_name','','start_time','2026-10-20T23:30:00+05:45','extra_stations',jsonb_build_array(jsonb_build_object('station','Simulator','start_time','23:30','end_time','00:30','duration_minutes',60,'rate',100)));
 assert public.loyalty_seconds(r,'2026-10-21T01:00:00+05:45')=3600,'Extra station crosses midnight in Nepal';
 insert into public.sessions(station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,amount,status) values('Loyalty test','Half hour',phone,now()-interval '2 days',now()-interval '2 days'+interval '30 minutes',30,100,50,'Completed') returning id into session_id;
 insert into public.sessions(station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,amount,status) values('Loyalty test','Half hour',phone,now()-interval '1 day',now()-interval '1 day'+interval '30 minutes',30,100,50,'Completed') returning id into other_id;
 assert (public.loyalty_balance(phone)->>'stamps')::int=0,'Two short visits never combine';
 update public.sessions set customer_name='Corrected name' where id=session_id;
 assert (select count(*)=1 from public.loyalty_visits where loyalty_visits.session_id=test_loyalty.session_id);
 delete from public.sessions where id in(session_id,other_id);
 insert into public.sessions(station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,amount,status) values('Loyalty test','Loyal customer',phone,now()-interval '2 days',now()-interval '2 days'+interval '10 hours',600,100,1000,'Completed') returning id into history_id;
 assert (public.loyalty_balance(phone)->>'available')::int=1;
 insert into public.sessions(station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,food_total,food_items,amount,status) values('Loyalty test','Loyal customer','+977 '||phone,now()-interval '61 minutes',now()-interval '1 minute',60,100,50,'[{"name":"Meal","price":50,"qty":1}]',150,'Active') returning id into session_id;
 update public.sessions set extra_stations=jsonb_build_array(jsonb_build_object('station','Simulator','start_time',start_time,'end_time',end_time,'duration_minutes',60,'rate',200)),amount=350 where id=session_id;
 quote:=public.loyalty_quote(session_id);assert (quote->>'available')::int=1;assert (quote->'choices'->0->>'credit')::numeric=100;
 payload:=jsonb_build_object('status','Completed','amount',150,'paid',true,'payment_method','Cash','cash_amount',150,'online_amount',0,'paid_amount',150,'due_amount',0,'discount_amount',200,'discount_type','amount','discount_value',0,'notes','');
 begin perform public.loyalty_checkout(actor,session_id,payload||jsonb_build_object('discount_amount',350),'Simulator');raise exception 'Expected reward cap';exception when others then assert SQLERRM like 'Reward amount changed%';end;
 assert (select count(*)=0 from public.loyalty_rewards where loyalty_rewards.session_id=test_loyalty.session_id),'Failure does not spend reward';
 begin perform public.loyalty_checkout(actor,session_id,payload||jsonb_build_object('amount',50),'Simulator');raise exception 'Expected other-station bill protection';exception when others then assert SQLERRM like 'Bill changed%';end;
 result:=public.loyalty_checkout(actor,session_id,payload,'Simulator');
 assert (result->>'amount')::numeric=150 and (result->>'loyalty_discount')::numeric=200,'Food remains payable';
 perform public.loyalty_checkout(actor,session_id,payload,'Simulator');
 assert (select count(*)=1 from public.loyalty_rewards where loyalty_rewards.session_id=test_loyalty.session_id),'Retries do not double-spend';
 assert (public.loyalty_balance(phone)->>'stamps')::int=11 and (public.loyalty_balance(phone)->>'available')::int=0;
 begin perform public.loyalty_checkout(actor,session_id,payload||jsonb_build_object('amount',40),'Simulator');raise exception 'Expected stale retry rejection';exception when others then assert SQLERRM like 'This session already%';end;
 begin update public.sessions set customer_phone='9800009702' where id=session_id;raise exception 'Expected identity protection';exception when others then assert SQLERRM like 'Void the loyalty%';end;
 update public.sessions set status='Cancelled' where id=session_id;
 assert (public.loyalty_balance(phone)->>'available')::int=1,'Cancellation returns reward';
 assert (select count(*)=0 from public.loyalty_visits where loyalty_visits.session_id=test_loyalty.session_id),'Cancellation removes stamps';
 update public.sessions set duration_minutes=30,end_time=start_time+interval '30 minutes' where id=history_id;
 assert (public.loyalty_balance(phone)->>'stamps')::int=0,'Historical corrections update awards';
 -- A real pause resumed after migration is retained, even after pause tags are removed.
 insert into public.sessions(station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,amount,status,notes) values('Pause test','Paused',phone,now()-interval '2 hours',now()+interval '1 hour',120,100,200,'Active','[Station Paused: Pause test | At: '||(now()-interval '1 hour')::text||' | RemainingMs: 3600000 | Reason: Break]') returning id into other_id;
 update public.sessions set notes='',end_time=now()+interval '1 hour' where id=other_id;
 assert (select jsonb_array_length(loyalty_pauses)=1 from public.sessions where id=other_id);
 update public.sessions set status='Completed' where id=other_id;
 assert (select played_seconds between 3599 and 3601 from public.loyalty_visits where loyalty_visits.session_id=other_id),'Resume pause retained at checkout';
 insert into public.sessions(station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,amount,status,notes) values('Food only','Food customer','9800009703',now()-interval '1 hour',now(),0,0,100,'Completed','[Food Only Sale]') returning id into other_id;
 assert not exists(select 1 from public.loyalty_visits where loyalty_visits.session_id=other_id),'Food-only does not earn';
 assert not has_table_privilege('anon','public.loyalty_rewards','INSERT');
 assert not has_function_privilege('anon','public.loyalty_capture()','EXECUTE');
 assert has_function_privilege('anon','public.loyalty_quote(uuid)','EXECUTE');
 assert not exists(select entry_id from public.accounting_lines group by entry_id having sum(debit-credit)<>0),'Checkout journal stays balanced';
end $$;
rollback;
\echo Passed: per-session hourly loyalty, pause/completion/overlap timing, identities, rewards, retries, corrections and accounting integration.
