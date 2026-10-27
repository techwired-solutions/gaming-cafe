-- Loyalty timestamps and saved-end-time eligibility, including explicit overtime waivers.
begin;
alter table public.loyalty_visits add column if not exists start_time timestamptz;
alter table public.loyalty_visits add column if not exists end_time timestamptz;
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
  -- Saved end times are authoritative. Only explicitly waived overtime is capped.
  if coalesce(r->>'notes','') like '%[Overtime Waived]%' then
   span:=span*tstzmultirange(tstzrange(s,least(f,s+make_interval(secs=>(coalesce((slot->>'minutes')::numeric,0)*60+known)::double precision)),'[)'));
  end if;
  total:=total+span;
 end loop;return total;
end $$;
create or replace function public.loyalty_accrue() returns trigger language plpgsql security definer set search_path=public as $$
declare spans tstzmultirange;first_at timestamptz;last_at timestamptz;secs integer;phone text:=public.loyalty_phone(new.customer_phone);
begin
 if new.status='Completed' and phone<>'' and jsonb_array_length(public.loyalty_slots(to_jsonb(new)))>0 and coalesce(new.notes,'') not ilike '%[Payment: Waived%' and coalesce(new.notes,'') not ilike '%[Internal Sale]%' then
  spans:=public.loyalty_play_ranges(to_jsonb(new),coalesce(new.loyalty_completed_at,now()));
  select coalesce(floor(sum(extract(epoch from upper(x)-lower(x)))),0)::int,min(lower(x)),max(upper(x)) into secs,first_at,last_at from unnest(spans) x;
  insert into public.loyalty_visits(session_id,phone,customer_name,played_seconds,stamps,historical,visited_at,start_time,end_time)
  values(new.id,phone,new.customer_name,secs,floor(secs/3600.0)::int,new.loyalty_historical,new.start_time,coalesce(first_at,new.start_time),coalesce(last_at,least(new.end_time,new.loyalty_completed_at)))
  on conflict(session_id) do update set phone=excluded.phone,customer_name=excluded.customer_name,played_seconds=excluded.played_seconds,stamps=excluded.stamps,historical=excluded.historical,visited_at=excluded.visited_at,start_time=excluded.start_time,end_time=excluded.end_time,updated_at=now();
 else delete from public.loyalty_visits where session_id=new.id;end if;return new;
end $$;
create or replace function public.loyalty_checkout(p_staff_id uuid,p_session_id uuid,p_update jsonb,p_station text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.sessions; slot jsonb; seconds numeric; credit numeric; reward public.loyalty_rewards; actor text; allowed text[]:=array['status','end_time','paid','payment_method','cash_amount','online_amount','paid_amount','due_amount','paid_at','amount','overtime_amount','discount_amount','discount_type','discount_value','notes','extra_stations'];k text;
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
 update public.sessions set status=r.status,end_time=r.end_time,paid=r.paid,payment_method=r.payment_method,cash_amount=r.cash_amount,online_amount=r.online_amount,paid_amount=r.paid_amount,due_amount=r.due_amount,paid_at=r.paid_at,amount=r.amount,overtime_amount=r.overtime_amount,discount_amount=r.discount_amount,discount_type=r.discount_type,discount_value=r.discount_value,notes=r.notes,extra_stations=r.extra_stations,loyalty_discount=credit where id=r.id returning * into r;
 return to_jsonb(r);
end $$;

update public.sessions set notes=notes where status='Completed';
revoke all on function public.loyalty_accrue(),public.loyalty_play_ranges(jsonb,timestamptz,text),public.loyalty_checkout(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.loyalty_checkout(uuid,uuid,jsonb,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
