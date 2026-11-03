-- Explicit expense classification for supplier payouts, including databases without a type default.
-- Run in Supabase SQL Editor. Does not change existing records.
begin;
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
   insert into public.expenses(title,category,amount,payment_source,type,expense_date,date,paid_by,created_by,notes)
   values(b.supplier_key||' food bill '||b.business_date,'Partner Payout',v_amount,'cafe_revenue','ongoing',
     (p_date::timestamp at time zone 'Asia/Kathmandu'),p_date,v_name,v_name,
     '[Settlement: '||b.supplier_key||'] [FoodBill: '||b.id||'] '||p_method||' '||coalesce(p_reference,'')) returning id into v_expense;
 end if;
 insert into public.food_partner_payments(id,bill_id,amount,method,payment_date,reference,staff_id,staff_name,expense_id)
 values(p_operation_id,p_bill_id,v_amount,p_method,p_date,coalesce(p_reference,''),p_staff_id,v_name,v_expense);
 return p_operation_id;
end $$;
notify pgrst, 'reload schema';
commit;
