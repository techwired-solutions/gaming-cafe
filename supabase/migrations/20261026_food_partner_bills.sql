-- Actual daily supplier bills and auditable payments. Run in Supabase SQL Editor.
begin;
create table if not exists public.food_partner_bills (
 id uuid primary key default gen_random_uuid(), supplier_key text not null check(length(trim(supplier_key))>0 and supplier_key<>'chillpill'),
 business_date date not null, amount numeric(14,2) not null check(amount>=0), reference text not null default '', notes text not null default '',
 order_gross_snapshot numeric(14,2) not null default 0, created_by uuid references public.staff(id),
 updated_at timestamptz not null default clock_timestamp(), created_at timestamptz not null default now(), unique(supplier_key,business_date)
);
create table if not exists public.food_partner_bill_revisions (
 id uuid primary key default gen_random_uuid(), bill_id uuid not null references public.food_partner_bills(id),
 old_amount numeric, new_amount numeric not null, reference text, notes text, staff_id uuid references public.staff(id), created_at timestamptz not null default now()
);
create table if not exists public.food_partner_payments (
 id uuid primary key, bill_id uuid not null references public.food_partner_bills(id), amount numeric(14,2) not null check(amount>0),
 method text not null check(method in ('Cash','Online / QR')), payment_date date not null, reference text not null default '',
 staff_id uuid references public.staff(id), staff_name text not null, expense_id uuid unique references public.expenses(id) on delete set null,
 voided_at timestamptz, void_reason text, created_at timestamptz not null default now()
);
create index if not exists food_partner_payments_bill on public.food_partner_payments(bill_id);
create or replace function public.food_partner_save_bill(p_staff_id uuid,p_supplier text,p_date date,p_amount numeric,p_reference text,p_notes text,p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.food_partner_bills; v_paid numeric; v_snapshot numeric; v_id uuid;
begin
 if not exists(select 1 from public.staff where id=p_staff_id and active and role='admin') then raise exception 'An active admin is required.'; end if;
 if p_amount is null or p_amount<0 or p_date is null or p_supplier is null or trim(p_supplier)='' or p_supplier='chillpill' then raise exception 'Choose a partner, date and valid bill amount.'; end if;
 -- Serialize both new bills and edits for the same source/day.
 perform pg_advisory_xact_lock(hashtextextended(p_supplier||p_date::text,0));
 select * into b from public.food_partner_bills where supplier_key=p_supplier and business_date=p_date for update;
 if found then
   if p_expected_updated_at is null or b.updated_at<>p_expected_updated_at then raise exception 'This bill changed on another device. Refresh and review it before saving.'; end if;
   select coalesce(sum(amount),0) into v_paid from public.food_partner_payments where bill_id=b.id and voided_at is null;
   if round(p_amount,2)<v_paid then raise exception 'Bill cannot be less than the payments already recorded (%). Void an incorrect payment first.',v_paid; end if;
   v_id:=b.id;
 end if;
 select coalesce(sum(greatest(0,coalesce((f->>'price')::numeric,0))*greatest(0,coalesce((f->>'qty')::numeric,0))),0)
 into v_snapshot from public.sessions s cross join lateral jsonb_array_elements(coalesce(s.food_items,'[]')) f
 left join public.menu_items m on m.id::text=f->>'id'
 where s.status<>'Cancelled' and (coalesce(s.start_time,s.created_at) at time zone 'Asia/Kathmandu')::date=p_date
 and coalesce(nullif(f->>'supplier',''),nullif(f->>'source',''),m.supplier,'chillpill')=p_supplier and coalesce(f->>'id','')<>'_extra_ctrl';
 if v_id is null then
   insert into public.food_partner_bills(supplier_key,business_date,amount,reference,notes,order_gross_snapshot,created_by)
   values(p_supplier,p_date,round(p_amount,2),coalesce(p_reference,''),coalesce(p_notes,''),v_snapshot,p_staff_id) returning id into v_id;
 else
   update public.food_partner_bills set amount=round(p_amount,2),reference=coalesce(p_reference,''),notes=coalesce(p_notes,''),
   order_gross_snapshot=v_snapshot,updated_at=clock_timestamp() where id=v_id;
 end if;
 insert into public.food_partner_bill_revisions(bill_id,old_amount,new_amount,reference,notes,staff_id)
 values(v_id,b.amount,round(p_amount,2),p_reference,p_notes,p_staff_id);
 return v_id;
end $$;
create or replace function public.food_partner_record_payment(p_staff_id uuid,p_bill_id uuid,p_operation_id uuid,p_amount numeric,p_method text,p_date date,p_reference text,p_existing_expense uuid default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.food_partner_bills; p public.food_partner_payments; e public.expenses; v_paid numeric; v_name text; v_expense uuid; v_amount numeric;
begin
 select name into v_name from public.staff where id=p_staff_id and active and role='admin';
 if not found then raise exception 'An active admin is required.'; end if;
 if p_operation_id is null or p_amount is null or p_amount<=0 or p_date is null or p_method not in ('Cash','Online / QR') or p_method is null then raise exception 'Enter a valid payment amount, date and method.'; end if;
 select * into b from public.food_partner_bills where id=p_bill_id for update;
 if not found then raise exception 'Record the partner bill first.'; end if;
 select * into p from public.food_partner_payments where id=p_operation_id;
 if found then
   if p.bill_id<>p_bill_id or p.amount<>round(p_amount,2) or p.method<>p_method or p.payment_date<>p_date or p.reference<>coalesce(p_reference,'') or (p_existing_expense is not null and p.expense_id<>p_existing_expense) or p.voided_at is not null then raise exception 'Payment request already used. Refresh before trying again.'; end if;
   return p.id;
 end if;
 v_amount:=round(p_amount,2);
 select coalesce(sum(amount),0) into v_paid from public.food_partner_payments where bill_id=p_bill_id and voided_at is null;
 if v_paid+v_amount>b.amount then raise exception 'Payment exceeds the remaining bill balance of %.',b.amount-v_paid; end if;
 if p_existing_expense is not null then
   select * into e from public.expenses where id=p_existing_expense for update;
   if not found or e.payment_source<>'cafe_revenue' or e.notes not like '%[Settlement: '||b.supplier_key||']%' or e.amount<>v_amount then raise exception 'Choose a matching historical supplier payout with the same amount.'; end if;
   if exists(select 1 from public.food_partner_payments where expense_id=e.id) then raise exception 'This expense is already linked to a payment.'; end if;
   v_expense:=e.id;
 else
   insert into public.expenses(title,category,amount,payment_source,expense_date,date,paid_by,created_by,notes)
   values(b.supplier_key||' food bill '||b.business_date,'Partner Payout',v_amount,'cafe_revenue',
     (p_date::timestamp at time zone 'Asia/Kathmandu'),p_date,v_name,v_name,
     '[Settlement: '||b.supplier_key||'] [FoodBill: '||b.id||'] '||p_method||' '||coalesce(p_reference,'')) returning id into v_expense;
 end if;
 insert into public.food_partner_payments(id,bill_id,amount,method,payment_date,reference,staff_id,staff_name,expense_id)
 values(p_operation_id,p_bill_id,v_amount,p_method,p_date,coalesce(p_reference,''),p_staff_id,v_name,v_expense);
 return p_operation_id;
end $$;
create or replace function public.food_partner_void_payment(p_staff_id uuid,p_payment_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.food_partner_payments; v_bill uuid;
begin
 if not exists(select 1 from public.staff where id=p_staff_id and active and role='admin') then raise exception 'An active admin is required.'; end if;
 if p_reason is null or length(trim(p_reason))=0 then raise exception 'A correction reason is required.'; end if;
 select bill_id into v_bill from public.food_partner_payments where id=p_payment_id;
 perform 1 from public.food_partner_bills where id=v_bill for update;
 select * into p from public.food_partner_payments where id=p_payment_id for update;
 if not found then raise exception 'Payment not found.'; end if;
 if p.voided_at is not null then return; end if;
 update public.food_partner_payments set voided_at=clock_timestamp(),void_reason=trim(p_reason) where id=p.id;
 delete from public.expenses where id=p.expense_id;
end $$;
create or replace function public.food_partner_protect_expense()
returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if exists(select 1 from public.food_partner_payments where expense_id=OLD.id and voided_at is null) then
   raise exception 'This expense belongs to a food bill payment. Correct it from Food Sources & Partners.';
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
drop trigger if exists food_partner_expense_guard on public.expenses;
create trigger food_partner_expense_guard before update or delete on public.expenses for each row execute function public.food_partner_protect_expense();
alter table public.food_partner_bills enable row level security;
alter table public.food_partner_payments enable row level security;
alter table public.food_partner_bill_revisions enable row level security;
drop policy if exists food_bills_read on public.food_partner_bills;
create policy food_bills_read on public.food_partner_bills for select using(true);
drop policy if exists food_payments_read on public.food_partner_payments;
create policy food_payments_read on public.food_partner_payments for select using(true);
drop policy if exists food_revisions_read on public.food_partner_bill_revisions;
create policy food_revisions_read on public.food_partner_bill_revisions for select using(true);
revoke all on public.food_partner_bills,public.food_partner_payments,public.food_partner_bill_revisions from anon,authenticated;
grant select on public.food_partner_bills,public.food_partner_payments,public.food_partner_bill_revisions to anon,authenticated;
revoke all on function public.food_partner_save_bill(uuid,text,date,numeric,text,text,timestamptz),public.food_partner_record_payment(uuid,uuid,uuid,numeric,text,date,text,uuid),public.food_partner_void_payment(uuid,uuid,text) from public;
grant execute on function public.food_partner_save_bill(uuid,text,date,numeric,text,text,timestamptz),public.food_partner_record_payment(uuid,uuid,uuid,numeric,text,date,text,uuid),public.food_partner_void_payment(uuid,uuid,text) to anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='food_partner_bills') then alter publication supabase_realtime add table public.food_partner_bills; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='food_partner_payments') then alter publication supabase_realtime add table public.food_partner_payments; end if;
 end if;
end $$;
commit;
