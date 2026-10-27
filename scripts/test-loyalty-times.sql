\set ON_ERROR_STOP on
do $$ begin assert current_database()='inventory_schema_test','Use isolated test database';end $$;
\ir ../supabase/migrations/20261027_loyalty_times.sql
\ir ../supabase/migrations/20261027_loyalty_times.sql
begin;
do $$
declare r jsonb;e uuid;start_at timestamptz:=now()-interval '3 hours';finish_at timestamptz:=now()-interval '1 hour';
begin
 r:=jsonb_build_object('station_name','Loyalty time test','start_time',start_at,'end_time',finish_at,'duration_minutes',60,'rate',100,'notes','');
 assert public.loyalty_seconds(r,now())=7200,'A genuine saved end time is authoritative even without an overtime amount';
 assert public.loyalty_seconds(r||jsonb_build_object('notes','[Overtime Waived]'),now())=3600,'Waived overtime does not earn stamps';
 r:=r||jsonb_build_object('end_time',start_at+interval '90 minutes','loyalty_pauses',jsonb_build_array(jsonb_build_object('station','Loyalty time test','from',start_at+interval '30 minutes','to',start_at+interval '60 minutes')));
 assert public.loyalty_seconds(r,now())=3600,'A resumed pause is excluded from saved start/end time';
 insert into public.sessions(station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,amount,status) values('Loyalty time test','Loyalty time test','9800009901',start_at,finish_at,60,100,200,'Completed') returning id into e;
 assert (select stamps=2 and start_time=start_at and end_time=finish_at from public.loyalty_visits where session_id=e),'Visit stores both start and end timestamps';
 update public.sessions set notes='[Overtime Waived]',overtime_amount=0 where id=e;
 assert (select stamps=1 and played_seconds=3600 and start_time=start_at and end_time=start_at+interval '1 hour' from public.loyalty_visits where session_id=e),'Old waived overrun is corrected';
 update public.sessions set notes='',end_time=start_at+interval '150 minutes' where id=e;
 assert (select stamps=2 and played_seconds=9000 and end_time=start_at+interval '150 minutes' from public.loyalty_visits where session_id=e),'Admin end-time correction updates the visit';
 assert not has_function_privilege('anon','public.loyalty_accrue()','EXECUTE');
end $$;
rollback;
\echo Passed: loyalty start/end timestamps, genuine saved overtime, waived overtime exclusion, pauses and corrected historical visits.
