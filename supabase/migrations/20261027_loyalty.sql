begin;
-- Native ChillPill loyalty. Whole hours per visit; overlapping stations count once.
create table if not exists public.loyalty_visits (
 session_id uuid primary key references public.sessions(id) on delete cascade,
 phone text not null, customer_name text not null, played_seconds integer not null,
 stamps integer not null check(stamps>=0), historical boolean not null default false,
 visited_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.loyalty_rewards (
 id uuid primary key default gen_random_uuid(),session_id uuid unique references public.sessions(id) on delete set null,
 phone text not null,station_name text not null,discount numeric(12,2) not null check(discount>0),
 staff_name text not null,created_at timestamptz not null default now(),voided_at timestamptz,checkout_payload jsonb
);
create index if not exists loyalty_visits_phone on public.loyalty_visits(phone);
create index if not exists loyalty_rewards_phone on public.loyalty_rewards(phone) where voided_at is null;
alter table public.sessions add column if not exists loyalty_pauses jsonb not null default '[]';
alter table public.sessions add column if not exists loyalty_completed_at timestamptz;
alter table public.sessions add column if not exists loyalty_historical boolean not null default false;
alter table public.sessions add column if not exists loyalty_discount numeric(12,2) not null default 0;
create or replace function public.loyalty_phone(p text) returns text language sql immutable as $$
 select case when length(d)=13 and left(d,3)='977' then substr(d,4) when length(d) between 7 and 15 then d else '' end
 from (select regexp_replace(regexp_replace(coalesce(p,''),'^00',''),'[^0-9]','','g') d) q
$$;
create or replace function public.loyalty_time(p text,base timestamptz) returns timestamptz language plpgsql stable as $$
begin
 if nullif(p,'') is null then return null;end if;
 if p ~ '^\d{2}:\d{2}(:\d{2})?$' then return (((base at time zone 'Asia/Kathmandu')::date+p::time) at time zone 'Asia/Kathmandu');end if;
 return p::timestamptz;
exception when others then return null;end $$;
create or replace function public.loyalty_slots(r jsonb) returns jsonb language plpgsql stable as $$
declare slots jsonb:='[]'; e jsonb; n text; s timestamptz; f timestamptz; base timestamptz:=nullif(r->>'start_time','')::timestamptz;
begin
 if coalesce((r->>'duration_minutes')::numeric,0)=0 and coalesce(r->>'notes','') like '%[Food Only Sale]%' then return slots;end if;
 for n in select trim(x) from regexp_split_to_table(coalesce(r->>'station_name',''),'[,+&/]') x where trim(x)<>'' loop
  slots:=slots||jsonb_build_array(jsonb_build_object('name',n,'bill',jsonb_array_length(slots)=0,'start',base,'end',coalesce(nullif(r->>'end_time','')::timestamptz,base+make_interval(mins=>coalesce((r->>'duration_minutes')::int,0))),'minutes',r->'duration_minutes','rate',r->'rate'));
 end loop;
 for e in select * from jsonb_array_elements(coalesce(r->'extra_stations','[]')) loop
  n:=trim(coalesce(e->>'station',e->>'station_name',''));if n='' or exists(select 1 from jsonb_array_elements(slots) x where lower(x->>'name')=lower(n)) then continue;end if;
  s:=coalesce(public.loyalty_time(e->>'start_time',base),base);f:=public.loyalty_time(e->>'end_time',s);
  if f<s and coalesce(e->>'end_time','') ~ '^\d{2}:\d{2}' then f:=f+interval '1 day';end if;
  slots:=slots||jsonb_build_array(jsonb_build_object('name',n,'bill',true,'start',s,'end',coalesce(f,s+make_interval(mins=>coalesce((e->>'duration_minutes')::int,0))),'minutes',e->'duration_minutes','rate',e->'rate'));
 end loop;return slots;
end $$;
create or replace function public.loyalty_pause_at(r jsonb,n text) returns timestamptz language plpgsql stable as $$
declare m text[]; e jsonb;
begin
 for m in select regexp_matches(coalesce(r->>'notes',''),'\[Station Paused:\s*([^|\]]+)\|\s*At:\s*([^|\]]+)','gi') loop
  if lower(trim(m[1]))=lower(n) then return public.loyalty_time(trim(m[2]),null);end if;
 end loop;
 for e in select * from jsonb_array_elements(coalesce(r->'extra_stations','[]')) loop
  if lower(coalesce(e->>'station',e->>'station_name',''))=lower(n) and e->>'is_paused'='true' then return public.loyalty_time(e->>'paused_at',null);end if;
 end loop;
 m:=regexp_match(coalesce(r->>'notes',''),'\[Session:\s*Paused\s*\|\s*At:\s*([^|\]]+)','i');
 if m is not null then return public.loyalty_time(trim(m[1]),null);end if;
 return null;
end $$;
create or replace function public.loyalty_play_ranges(r jsonb,cutoff timestamptz,p_name text default null) returns tstzmultirange language plpgsql stable as $$
declare total tstzmultirange:='{}'; span tstzmultirange; slot jsonb; p jsonb; m text[]; s timestamptz; f timestamptz; stop timestamptz; known numeric; excess numeric;
begin
 for slot in select * from jsonb_array_elements(public.loyalty_slots(r)) loop
  if p_name is not null and lower(slot->>'name')<>lower(p_name) then continue;end if;
  s:=(slot->>'start')::timestamptz;f:=least((slot->>'end')::timestamptz,cutoff);if s is null or f is null or f<=s then continue;end if;
  for m in select regexp_matches(coalesce(r->>'notes',''),'\[Station Completed:\s*([^|\]]+)\|\s*At:\s*([^|\]]+)','gi') loop
   if lower(trim(m[1]))=lower(slot->>'name') then f:=least(f,public.loyalty_time(trim(m[2]),s));end if;
  end loop;
  stop:=public.loyalty_pause_at(r,slot->>'name');if stop is not null then f:=least(f,stop);end if;
  if f<=s then continue;end if;
  span:=tstzmultirange(tstzrange(s,f,'[)'));known:=0;
  for p in select * from jsonb_array_elements(coalesce(r->'loyalty_pauses','[]')) loop
   if lower(p->>'station')=lower(slot->>'name') and (p->>'to')::timestamptz>(p->>'from')::timestamptz then
    span:=span-tstzmultirange(tstzrange((p->>'from')::timestamptz,(p->>'to')::timestamptz,'[)'));
    known:=known+extract(epoch from (p->>'to')::timestamptz-(p->>'from')::timestamptz);
   end if;
  end loop;
  -- Old resumes extended end_time but did not retain pause intervals. Keep the recorded
  -- booked duration as a conservative estimate rather than count the extension as play.
  excess:=greatest(0,extract(epoch from (slot->>'end')::timestamptz-s)-coalesce((slot->>'minutes')::numeric,0)*60-known);
  if excess>0 and coalesce((r->>'overtime_amount')::numeric,0)=0 then span:=span*tstzmultirange(tstzrange(s,least(f,(slot->>'end')::timestamptz-make_interval(secs=>excess::double precision)),'[)'));end if;
  total:=total+span;
 end loop;return total;
end $$;
create or replace function public.loyalty_seconds(r jsonb,cutoff timestamptz) returns integer language sql stable as $$
 select coalesce(floor(sum(extract(epoch from upper(x)-lower(x)))),0)::integer from unnest(public.loyalty_play_ranges(r,cutoff)) x
$$;
create or replace function public.loyalty_capture() returns trigger language plpgsql security definer set search_path=public as $$
declare slot jsonb; at_pause timestamptz; stop timestamptz; oldphone text; phone text; secs integer;
begin
 if TG_OP='DELETE' then
  perform pg_advisory_xact_lock(hashtextextended('loyalty:'||public.loyalty_phone(old.customer_phone),0));
  update public.loyalty_rewards set voided_at=coalesce(voided_at,now()) where session_id=old.id;return old;
 end if;
 phone:=public.loyalty_phone(new.customer_phone);
 if new.loyalty_discount<>0 and not exists(select 1 from public.loyalty_rewards where session_id=new.id and discount=new.loyalty_discount and voided_at is null) then
  if new.status='Cancelled' then new.loyalty_discount:=0;else raise exception 'Loyalty credits must be redeemed through checkout';end if;
 end if;
 if TG_OP='UPDATE' then
  oldphone:=public.loyalty_phone(old.customer_phone);
  if new.status='Cancelled' then new.loyalty_discount:=0;end if;
  -- Lock both identities in deterministic order when correcting a customer's phone.
  perform pg_advisory_xact_lock(hashtextextended('loyalty:'||least(phone,oldphone),0));
  if oldphone<>phone then perform pg_advisory_xact_lock(hashtextextended('loyalty:'||greatest(phone,oldphone),0));end if;
  if old.loyalty_discount>0 and new.status<>'Cancelled' and new.loyalty_discount<>old.loyalty_discount then raise exception 'A recorded loyalty credit cannot be edited';end if;
  if oldphone<>phone and exists(select 1 from public.loyalty_rewards where session_id=old.id and voided_at is null) then raise exception 'Void the loyalty reward before changing this customer phone';end if;
  new.loyalty_pauses:=old.loyalty_pauses;
  for slot in select * from jsonb_array_elements(public.loyalty_slots(to_jsonb(old))) loop
   at_pause:=public.loyalty_pause_at(to_jsonb(old),slot->>'name');
   if old.status='Active' and at_pause is not null and (public.loyalty_pause_at(to_jsonb(new),slot->>'name') is null or new.status<>'Active') then
    new.loyalty_pauses:=new.loyalty_pauses||jsonb_build_array(jsonb_build_object('station',slot->>'name','from',at_pause,'to',greatest(at_pause,clock_timestamp())));
   end if;
  end loop;
  if old.status='Completed' and new.status='Active' and exists(select 1 from public.loyalty_rewards where session_id=old.id and voided_at is null) then raise exception 'A redeemed visit cannot be reopened; correct or cancel it first';end if;
  if old.status='Completed' and new.status='Completed' then new.loyalty_completed_at:=old.loyalty_completed_at;
  elsif new.status='Completed' then new.loyalty_completed_at:=clock_timestamp();else new.loyalty_completed_at:=null;end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('loyalty:'||phone,0));
  new.loyalty_historical:=new.status='Completed';
  new.loyalty_completed_at:=case when new.status='Completed' then clock_timestamp() else null end;
 end if;
 if new.status='Cancelled' then update public.loyalty_rewards set voided_at=coalesce(voided_at,now()) where session_id=new.id;end if;
 return new;
end $$;
create or replace function public.loyalty_accrue() returns trigger language plpgsql security definer set search_path=public as $$
declare secs integer;phone text:=public.loyalty_phone(new.customer_phone);
begin
 if new.status='Completed' and phone<>'' and jsonb_array_length(public.loyalty_slots(to_jsonb(new)))>0 and coalesce(new.notes,'') not ilike '%[Payment: Waived%' and coalesce(new.notes,'') not ilike '%[Internal Sale]%' then
  secs:=public.loyalty_seconds(to_jsonb(new),coalesce(new.loyalty_completed_at,now()));
  insert into public.loyalty_visits(session_id,phone,customer_name,played_seconds,stamps,historical,visited_at)
  values(new.id,phone,new.customer_name,secs,floor(secs/3600.0)::int,new.loyalty_historical,new.start_time)
  on conflict(session_id) do update set phone=excluded.phone,customer_name=excluded.customer_name,played_seconds=excluded.played_seconds,stamps=excluded.stamps,historical=excluded.historical,visited_at=excluded.visited_at,updated_at=now();
 else delete from public.loyalty_visits where session_id=new.id;end if;return new;
end $$;
drop trigger if exists loyalty_capture on public.sessions;
create trigger loyalty_capture before insert or update or delete on public.sessions for each row execute function public.loyalty_capture();
drop trigger if exists loyalty_accrue on public.sessions;
create trigger loyalty_accrue after insert or update on public.sessions for each row execute function public.loyalty_accrue();
create or replace function public.loyalty_balance(p_phone text) returns jsonb language sql stable security definer set search_path=public as $$
 with s as(select coalesce(sum(stamps),0)::int stamps,coalesce(sum(played_seconds),0)::bigint seconds from public.loyalty_visits where phone=public.loyalty_phone(p_phone)),r as(select count(*)::int redeemed from public.loyalty_rewards where phone=public.loyalty_phone(p_phone) and voided_at is null)
 select jsonb_build_object('stamps',stamps,'played_seconds',seconds,'redeemed',redeemed,'available',greatest(0,floor(stamps/10.0)::int-redeemed),'progress',greatest(0,stamps-redeemed*10)%10,'deficit',greatest(0,redeemed*10-stamps)) from s,r
$$;
create or replace function public.loyalty_quote(p_session_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.sessions;slot jsonb;seconds numeric;choices jsonb:='[]';credit numeric;
begin
 select * into r from public.sessions where id=p_session_id;if not found then raise exception 'Session not found';end if;
 for slot in select * from jsonb_array_elements(public.loyalty_slots(to_jsonb(r))) loop
  select coalesce(sum(extract(epoch from upper(x)-lower(x))),0) into seconds from unnest(public.loyalty_play_ranges(to_jsonb(r),now(),slot->>'name')) x;
  credit:=round(least(60,coalesce((slot->>'minutes')::numeric,0),seconds/60)/60*coalesce((slot->>'rate')::numeric,0));
  if credit>0 then choices:=choices||jsonb_build_array(jsonb_build_object('name',slot->>'name','credit',credit,'minutes',least(60,coalesce((slot->>'minutes')::numeric,0),seconds/60)));end if;
 end loop;
 return public.loyalty_balance(r.customer_phone)||jsonb_build_object('phone',public.loyalty_phone(r.customer_phone),'choices',choices,'session_seconds',public.loyalty_seconds(to_jsonb(r),now()));
end $$;
create or replace function public.loyalty_bill_base(r jsonb) returns numeric language plpgsql stable as $$
declare slot jsonb;mins numeric;p timestamptz;remaining numeric;total numeric:=0;food numeric;m text[];e jsonb;
begin
 for slot in select * from jsonb_array_elements(public.loyalty_slots(r)) loop
  if not (slot->>'bill')::boolean then continue;end if;
  mins:=coalesce((slot->>'minutes')::numeric,0);p:=public.loyalty_pause_at(r,slot->>'name');
  if p is not null then
   remaining:=null;
   for m in select regexp_matches(coalesce(r->>'notes',''),'\[Station Paused:\s*([^|\]]+)\|[^\]]*RemainingMs:\s*(\d+)','gi') loop
    if lower(trim(m[1]))=lower(slot->>'name') then remaining:=m[2]::numeric/1000;exit;end if;
   end loop;
   if remaining is null then
    for e in select * from jsonb_array_elements(coalesce(r->'extra_stations','[]')) loop
     if lower(coalesce(e->>'station',e->>'station_name',''))=lower(slot->>'name') and e->>'is_paused'='true' then remaining:=nullif(e->>'paused_remaining_ms','')::numeric/1000;end if;
    end loop;
   end if;
   if remaining is null then m:=regexp_match(coalesce(r->>'notes',''),'\[Session:\s*Paused[^\]]*RemainingMs:\s*(\d+)','i');if m is not null then remaining:=m[1]::numeric/1000;end if;end if;
   remaining:=coalesce(remaining,greatest(0,extract(epoch from (slot->>'end')::timestamptz-p)));
   mins:=greatest(1,least(mins,round((mins*60-remaining)/60)));
  end if;
  total:=total+round(mins/60*coalesce((slot->>'rate')::numeric,0));
 end loop;
 select coalesce(sum(coalesce((x->>'price')::numeric,0)*coalesce((x->>'qty')::numeric,0)),0) into food from jsonb_array_elements(coalesce(r->'food_items','[]')) x;
 return total+food;
end $$;
-- The only checkout path that consumes a reward: one transaction with the session payment.
create or replace function public.loyalty_checkout(p_staff_id uuid,p_session_id uuid,p_update jsonb,p_station text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.sessions; slot jsonb; seconds numeric; credit numeric; reward public.loyalty_rewards; actor text; allowed text[]:=array['status','end_time','paid','payment_method','cash_amount','online_amount','paid_amount','due_amount','paid_at','amount','overtime_amount','discount_amount','discount_type','discount_value','notes'];k text;
begin
 select name into actor from public.staff where id=p_staff_id and active;if actor is null then raise exception 'An active staff member is required';end if;
 select * into r from public.sessions where id=p_session_id for update;if not found then raise exception 'Session not found';end if;
 perform pg_advisory_xact_lock(hashtextextended('loyalty:'||public.loyalty_phone(r.customer_phone),0));
 select * into reward from public.loyalty_rewards where session_id=r.id and voided_at is null;
 if found then
  if r.status='Completed' and lower(reward.station_name)=lower(p_station) and reward.checkout_payload=p_update then return to_jsonb(r);end if;
  raise exception 'This session already redeemed a reward';
 end if;
 if exists(select 1 from public.loyalty_rewards where session_id=r.id) then raise exception 'This returned reward belongs to an earlier checkout; start a new session to redeem it again';end if;
 if r.status<>'Active' or public.loyalty_phone(r.customer_phone)='' then raise exception 'An active gaming session with a customer phone is required';end if;
 if (public.loyalty_balance(r.customer_phone)->>'available')::int<1 then raise exception 'No free-hour reward is available';end if;
 if p_update->>'status' is distinct from 'Completed' or coalesce(p_update->>'notes','') ilike '%[Payment: Waived%' or coalesce(p_update->>'notes','') ilike '%[Internal Sale]%' then raise exception 'Complete a regular session to redeem a reward';end if;
 for k in select jsonb_object_keys(p_update) loop if not k=any(allowed) then raise exception 'Unsupported checkout field: %',k;end if;end loop;
 select x into slot from jsonb_array_elements(public.loyalty_slots(to_jsonb(r))) x where lower(x->>'name')=lower(p_station);
 if slot is null then raise exception 'Select a station in this session';end if;
 select coalesce(sum(extract(epoch from upper(x)-lower(x))),0) into seconds from unnest(public.loyalty_play_ranges(to_jsonb(r),clock_timestamp(),p_station)) x;
 -- Credit cannot exceed one hour, the selected station's booked charge, or its elapsed play.
 credit:=round(least(60,coalesce((slot->>'minutes')::numeric,0),seconds/60)/60*coalesce((slot->>'rate')::numeric,0));
 if credit<=0 then raise exception 'The selected station has no eligible playing time';end if;
 if coalesce((p_update->>'discount_value')::numeric,0)<>0 or coalesce((p_update->>'discount_amount')::numeric,0)>credit or coalesce((p_update->>'discount_amount')::numeric,0)<=0 then raise exception 'Reward amount changed; reopen checkout and try again';end if;
 credit:=(p_update->>'discount_amount')::numeric;
 if p_update->>'amount' is null or (p_update->>'amount')::numeric<>greatest(0,public.loyalty_bill_base(to_jsonb(r))+coalesce((p_update->>'overtime_amount')::numeric,0)-credit) then raise exception 'Bill changed; reopen checkout to refresh the free-hour credit';end if;
 if coalesce((p_update->>'overtime_amount')::numeric,0)<0 or coalesce((p_update->>'paid_amount')::numeric,0)<0 or coalesce((p_update->>'due_amount')::numeric,0)<0 or coalesce((p_update->>'paid_amount')::numeric,0)+coalesce((p_update->>'due_amount')::numeric,0)<>(p_update->>'amount')::numeric then raise exception 'Invalid reward checkout payment totals';end if;
 if coalesce((p_update->>'cash_amount')::numeric,0)<0 or coalesce((p_update->>'online_amount')::numeric,0)<0 or coalesce((p_update->>'cash_amount')::numeric,0)+coalesce((p_update->>'online_amount')::numeric,0)<>coalesce((p_update->>'paid_amount')::numeric,0) then raise exception 'Invalid reward checkout cash/bank totals';end if;
 if (p_update->>'amount')::numeric<r.food_total then raise exception 'A loyalty reward cannot discount food';end if;
 insert into public.loyalty_rewards(session_id,phone,station_name,discount,staff_name,checkout_payload) values(r.id,public.loyalty_phone(r.customer_phone),slot->>'name',credit,actor,p_update);
 p_update:=p_update||jsonb_build_object('loyalty_discount',credit);
 r:=jsonb_populate_record(r,p_update);
 update public.sessions set status=r.status,end_time=r.end_time,paid=r.paid,payment_method=r.payment_method,cash_amount=r.cash_amount,online_amount=r.online_amount,paid_amount=r.paid_amount,due_amount=r.due_amount,paid_at=r.paid_at,amount=r.amount,overtime_amount=r.overtime_amount,discount_amount=r.discount_amount,discount_type=r.discount_type,discount_value=r.discount_value,notes=r.notes,loyalty_discount=credit where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
-- Backfill only once; refreshes through triggers after future edits/cancellation.
update public.sessions set loyalty_historical=true,loyalty_completed_at=coalesce(end_time,start_time+make_interval(mins=>duration_minutes)) where status='Completed' and not exists(select 1 from public.loyalty_visits where session_id=sessions.id);
alter table public.loyalty_visits enable row level security;
alter table public.loyalty_rewards enable row level security;
drop policy if exists loyalty_read on public.loyalty_visits;
create policy loyalty_read on public.loyalty_visits for select to anon,authenticated using(true);
drop policy if exists loyalty_read on public.loyalty_rewards;
create policy loyalty_read on public.loyalty_rewards for select to anon,authenticated using(true);
revoke all on public.loyalty_visits,public.loyalty_rewards from anon,authenticated;
grant select on public.loyalty_visits,public.loyalty_rewards to anon,authenticated;
revoke all on function public.loyalty_phone(text),public.loyalty_time(text,timestamptz),public.loyalty_slots(jsonb),public.loyalty_pause_at(jsonb,text),public.loyalty_play_ranges(jsonb,timestamptz,text),public.loyalty_seconds(jsonb,timestamptz),public.loyalty_capture(),public.loyalty_accrue(),public.loyalty_balance(text),public.loyalty_quote(uuid),public.loyalty_bill_base(jsonb),public.loyalty_checkout(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.loyalty_balance(text),public.loyalty_quote(uuid),public.loyalty_checkout(uuid,uuid,jsonb,text) to anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  begin alter publication supabase_realtime add table public.loyalty_visits;exception when duplicate_object then null;end;
  begin alter publication supabase_realtime add table public.loyalty_rewards;exception when duplicate_object then null;end;
 end if;
end $$;

notify pgrst, 'reload schema';
commit;
