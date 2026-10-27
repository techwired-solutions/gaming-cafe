-- Accounts, expense liabilities, payments, and a balanced audit journal.
-- Requires the existing inventory and food-partner migrations.
begin;
create table if not exists public.accounting_settings(id integer primary key check(id=1),tracking_started_at timestamptz not null default now());
insert into public.accounting_settings(id) values(1) on conflict do nothing;
create table if not exists public.accounting_entries(
 id uuid primary key default gen_random_uuid(),source_type text not null,source_id text not null,description text not null,
 business_date date not null default ((now() at time zone 'Asia/Kathmandu')::date),created_at timestamptz not null default now()
);
create table if not exists public.accounting_lines(
 id bigint generated always as identity primary key,entry_id uuid not null references public.accounting_entries(id),
 account text not null check(account in ('cash','bank','receivables','customer_advances','supplier_payable','expense_payable','owner_payable','owner_loan','capital','sales_income','other_income','supplier_cost','operating_expense','capital_asset','opening_equity','unclassified')),
 party text not null default '',debit numeric(16,2) not null default 0 check(debit>=0),credit numeric(16,2) not null default 0 check(credit>=0),check((debit>0 and credit=0) or (credit>0 and debit=0))
);
alter table public.accounting_lines drop constraint if exists accounting_lines_account_check;
alter table public.accounting_lines add constraint accounting_lines_account_check check(account in ('cash','bank','receivables','customer_advances','supplier_payable','expense_payable','owner_payable','owner_loan','capital','sales_income','other_income','supplier_cost','operating_expense','capital_asset','opening_equity','unclassified'));
create index if not exists accounting_lines_entry on public.accounting_lines(entry_id);
create index if not exists accounting_lines_account on public.accounting_lines(account,party);
create index if not exists accounting_entries_day on public.accounting_entries(business_date);
create table if not exists public.accounting_source_state(source_type text not null,source_id text not null,postings jsonb not null,primary key(source_type,source_id));
create table if not exists public.accounting_balance_checks(id uuid primary key,cash_count numeric(16,2) not null,bank_count numeric(16,2) not null,cash_adjustment numeric(16,2) not null,bank_adjustment numeric(16,2) not null,reason text not null,staff_name text not null,created_at timestamptz not null default now());
alter table public.expenses add column if not exists accounting_kind text not null default 'operating' check(accounting_kind in ('operating','capital'));
alter table public.expenses add column if not exists vendor text not null default '';
alter table public.expenses add column if not exists due_date date;
alter table public.expenses add column if not exists accounting_managed boolean not null default false;
alter table public.expenses add column if not exists request_id uuid unique;
alter table public.expenses add column if not exists request_payload jsonb;
alter table public.expenses add column if not exists voided_at timestamptz;
alter table public.expenses add column if not exists void_reason text;
alter table public.capital_contributions add column if not exists receiving_account text not null default 'unclassified' check(receiving_account in ('cash','bank','unclassified'));
create table if not exists public.accounting_expense_payments(
 id uuid primary key,expense_id uuid not null references public.expenses(id),amount numeric(16,2) not null check(amount>0),
 account text not null check(account in ('cash','bank','owner','unclassified')),owner_name text not null default '',
 payment_date date not null,reference text not null default '',staff_name text not null,legacy boolean not null default false,
 voided_at timestamptz,void_reason text,created_at timestamptz not null default now()
);
create index if not exists accounting_expense_payments_expense on public.accounting_expense_payments(expense_id);
create table if not exists public.accounting_transactions(
 id uuid primary key,kind text not null check(kind in ('transfer','owner_reimbursement','owner_loan','loan_repayment','other_receipt','capital')),
 from_account text,to_account text,amount numeric(16,2) not null check(amount>0),party text not null default '',
 business_date date not null,reference text not null,staff_name text not null,created_at timestamptz not null default now()
);

create or replace function public.accounting_post_state(p_type text,p_id text,p_description text,p_postings jsonb,p_date date default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old jsonb; v_delta jsonb; v_sum numeric; v_entry uuid; k text; amount numeric; separator int;
begin
 perform pg_advisory_xact_lock(hashtextextended('accounting:'||p_type||':'||p_id,0));
 select postings into v_old from public.accounting_source_state where source_type=p_type and source_id=p_id for update;
 v_old:=coalesce(v_old,'{}');
 select coalesce(sum(value::numeric),0) into v_sum from jsonb_each_text(p_postings);
 if v_sum<>0 then raise exception 'Accounting entry is not balanced (%).',v_sum; end if;
 select coalesce(jsonb_object_agg(key,delta),'{}') into v_delta from (
  select key,round(coalesce((p_postings->>key)::numeric,0)-coalesce((v_old->>key)::numeric,0),2) delta
  from (select jsonb_object_keys(p_postings) key union select jsonb_object_keys(v_old)) keys
 ) differences where delta<>0;
 if v_delta<>'{}'::jsonb then
  insert into public.accounting_entries(source_type,source_id,description,business_date) values(p_type,p_id,p_description,coalesce(p_date,(now() at time zone 'Asia/Kathmandu')::date)) returning id into v_entry;
  for k,amount in select key,value::numeric from jsonb_each_text(v_delta) loop
   separator:=strpos(k,'::');
   insert into public.accounting_lines(entry_id,account,party,debit,credit)
   values(v_entry,case when separator>0 then left(k,separator-1) else k end,case when separator>0 then substring(k from separator+2) else '' end,greatest(amount,0),greatest(-amount,0));
  end loop;
 end if;
 insert into public.accounting_source_state values(p_type,p_id,p_postings) on conflict(source_type,source_id) do update set postings=excluded.postings;
end $$;
create or replace function public.accounting_session_postings(r jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare invoice numeric; paid numeric; cash numeric; bank numeric; ratio numeric; notes text:=coalesce(r->>'notes',''); m text[];
begin
 if r->>'status'='Cancelled' or notes like '%[Payment: Waived%' or r->>'payment_method'='Waived' then return '{}'; end if;
 invoice:=greatest(0,coalesce((r->>'amount')::numeric,0));
 paid:=least(invoice,greatest(0,case when coalesce((r->>'paid')::boolean,false) then invoice else coalesce((r->>'paid_amount')::numeric,0) end));
 if r->>'status'='Booked' and paid=0 then return '{}'; end if;
 cash:=greatest(0,coalesce((r->>'cash_amount')::numeric,0));bank:=greatest(0,coalesce((r->>'online_amount')::numeric,0));
 if cash+bank=0 and notes like '%[Payment: Split%' then
  m:=regexp_match(notes,'Cash:\s*([0-9.]+)');cash:=coalesce(m[1]::numeric,0);
  m:=regexp_match(notes,'Online:\s*([0-9.]+)');bank:=coalesce(m[1]::numeric,0);
 end if;
 if cash+bank>0 then ratio:=cash/(cash+bank);cash:=round(paid*ratio,2);bank:=paid-cash;
 elsif r->>'payment_method'='Online' then bank:=paid;cash:=0;else cash:=paid;bank:=0;end if;
 if r->>'status'='Booked' then return jsonb_build_object('cash',cash,'bank',bank,'customer_advances',-paid);end if;
 return jsonb_build_object('receivables',invoice-paid,'sales_income',-invoice,'cash',cash,'bank',bank);
end $$;
create or replace function public.accounting_expense_postings(r jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare value numeric; state jsonb;begin
 if r->>'voided_at' is not null then return '{}';end if;
 value:=(r->>'amount')::numeric;
 state:=jsonb_build_object(case when r->>'accounting_kind'='capital' or r->>'type'='setup' then 'capital_asset' else 'operating_expense' end,value,'expense_payable',-value);
 if r->>'payment_source'='partner_personal' and r->>'reimbursement_status'='reimbursed' then
  state:=state||jsonb_build_object('owner_payable::'||coalesce(r->>'paid_by_partner_name',''),value,'unclassified',-value);
 end if;return state;
end $$;
create or replace function public.accounting_capture()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb; state jsonb:='{}'; typ text; d date; target text; expense public.expenses; is_old_link boolean; description text;
begin
 if TG_OP='DELETE' then r:=to_jsonb(OLD);else r:=to_jsonb(NEW);end if;
 typ:=TG_TABLE_NAME;
 if TG_OP<>'DELETE' then
  case TG_TABLE_NAME
   when 'sessions' then state:=public.accounting_session_postings(r);
   when 'food_partner_bills' then description:=(r->>'supplier_key')||' supplier bill '||(r->>'business_date');state:=jsonb_build_object('supplier_cost',(r->>'amount')::numeric,'supplier_payable',-(r->>'amount')::numeric);d:=(r->>'business_date')::date;
   when 'food_partner_payments' then
    if r->>'voided_at' is null then
     select * into expense from public.expenses where id=(r->>'expense_id')::uuid;description:='Food supplier payment: '||coalesce(expense.title,r->>'bill_id');
     is_old_link:=expense.notes not like '%[FoodBill:%';
     target:=case when is_old_link then 'opening_equity' when r->>'method'='Cash' then 'cash' else 'bank' end;
     state:=jsonb_build_object('supplier_payable',(r->>'amount')::numeric,target,-(r->>'amount')::numeric);
     d:=(r->>'payment_date')::date;
    end if;
   when 'expenses' then
    if coalesce(r->>'notes','') like '%[Settlement:%' then return coalesce(NEW,OLD); end if;
    if r->>'voided_at' is null then
     target:=case when r->>'accounting_kind'='capital' or r->>'type'='setup' then 'capital_asset' else 'operating_expense' end;
     state:=public.accounting_expense_postings(r);
     if TG_OP='INSERT' and not coalesce((r->>'accounting_managed')::boolean,false) and (r->>'amount')::numeric>0 then
      insert into public.accounting_expense_payments(id,expense_id,amount,account,owner_name,payment_date,reference,staff_name,legacy)
      values(gen_random_uuid(),(r->>'id')::uuid,(r->>'amount')::numeric,case when r->>'payment_source'='partner_personal' then 'owner' else 'unclassified' end,
        coalesce(r->>'paid_by_partner_name',''),coalesce((r->>'date')::date,(now() at time zone 'Asia/Kathmandu')::date),coalesce(r->>'notes',''),coalesce(r->>'created_by','Legacy entry'),true);
     end if;
     if TG_OP='INSERT' then d:=coalesce((r->>'expense_date')::timestamptz at time zone 'Asia/Kathmandu',now() at time zone 'Asia/Kathmandu')::date;end if;
    end if;
   when 'accounting_expense_payments' then
    select * into expense from public.expenses where id=(r->>'expense_id')::uuid;description:='Expense payment: '||coalesce(expense.title,r->>'expense_id');
    if r->>'voided_at' is null then
     target:=case when r->>'account'='owner' then 'owner_payable::'||(r->>'owner_name') else r->>'account' end;
     state:=jsonb_build_object('expense_payable',(r->>'amount')::numeric,target,-(r->>'amount')::numeric);d:=(r->>'payment_date')::date;
    end if;
   when 'capital_contributions' then
    target:=r->>'receiving_account';state:=jsonb_build_object(target,(r->>'amount')::numeric,'capital',-(r->>'amount')::numeric);d:=(r->>'contribution_date')::date;
   when 'accounting_transactions' then
    target:=case r->>'kind' when 'owner_reimbursement' then 'owner_payable::'||(r->>'party') when 'loan_repayment' then 'owner_loan::'||(r->>'party') else r->>'to_account' end;
    state:=jsonb_build_object(target,(r->>'amount')::numeric,
     case r->>'kind' when 'owner_loan' then 'owner_loan::'||(r->>'party') when 'other_receipt' then 'other_income' when 'capital' then 'capital' else r->>'from_account' end,-(r->>'amount')::numeric);
    d:=(r->>'business_date')::date;
  end case;
 end if;
 perform public.accounting_post_state(typ,r->>'id',coalesce(description,nullif(r->>'title',''),nullif(r->>'description',''),nullif(r->>'reference',''),nullif(r->>'customer_name',''),nullif(r->>'partner_name',''),replace(TG_TABLE_NAME,'_',' ')),state,d);
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;

-- Capture prior cumulative states without inventing historical cash/bank movements.
-- Preserve every legacy expense as paid, since the old workflow recorded payments only.
insert into public.accounting_expense_payments(id,expense_id,amount,account,owner_name,payment_date,reference,staff_name,legacy)
 select gen_random_uuid(),e.id,e.amount,case when e.payment_source='partner_personal' then 'owner' else 'unclassified' end,
 coalesce(e.paid_by_partner_name,''),coalesce(e.date,(e.expense_date at time zone 'Asia/Kathmandu')::date),coalesce(e.notes,''),coalesce(e.created_by,'Legacy record'),true
 from public.expenses e where not e.accounting_managed and e.amount>0 and coalesce(e.notes,'') not like '%[Settlement:%'
 and not exists(select 1 from public.accounting_expense_payments p where p.expense_id=e.id);
insert into public.accounting_source_state select 'sessions',s.id::text,public.accounting_session_postings(to_jsonb(s)) from public.sessions s on conflict do nothing;
insert into public.accounting_source_state select 'food_partner_bills',b.id::text,jsonb_build_object('supplier_cost',b.amount,'supplier_payable',-b.amount) from public.food_partner_bills b on conflict do nothing;
insert into public.accounting_source_state select 'food_partner_payments',p.id::text,case when p.voided_at is not null then '{}'::jsonb else jsonb_build_object('supplier_payable',p.amount,case when e.notes not like '%[FoodBill:%' then 'opening_equity' when p.method='Cash' then 'cash' else 'bank' end,-p.amount) end from public.food_partner_payments p left join public.expenses e on e.id=p.expense_id on conflict do nothing;
insert into public.accounting_source_state select 'expenses',e.id::text,public.accounting_expense_postings(to_jsonb(e)) from public.expenses e where coalesce(e.notes,'') not like '%[Settlement:%' on conflict do nothing;
insert into public.accounting_source_state select 'accounting_expense_payments',p.id::text,case when p.voided_at is not null then '{}'::jsonb else jsonb_build_object('expense_payable',p.amount,case when p.account='owner' then 'owner_payable::'||p.owner_name else p.account end,-p.amount) end from public.accounting_expense_payments p on conflict do nothing;
insert into public.accounting_source_state select 'capital_contributions',c.id::text,jsonb_build_object(c.receiving_account,c.amount,'capital',-c.amount) from public.capital_contributions c on conflict do nothing;
-- Bring forward outstanding assets/liabilities, not old receipts or paid operating costs.
do $$ declare opening jsonb; total numeric;begin
 if not exists(select 1 from public.accounting_source_state where source_type='opening' and source_id='legacy') then
  select coalesce(jsonb_object_agg(key,amount),'{}') into opening from (
   select key,sum(value::numeric) amount from public.accounting_source_state s cross join lateral jsonb_each_text(s.postings)
   where key in ('receivables','customer_advances','supplier_payable','expense_payable') or key like 'owner_payable::%' group by key
  ) positions where amount<>0;
  select coalesce(sum(value::numeric),0) into total from jsonb_each_text(opening);
  opening:=opening||jsonb_build_object('opening_equity',-total);
  perform public.accounting_post_state('opening','legacy','Opening receivables and liabilities',opening);
 end if;
end $$;
do $$ declare t text;begin
 foreach t in array array['sessions','expenses','food_partner_bills','food_partner_payments','accounting_expense_payments','capital_contributions','accounting_transactions'] loop
  execute format('drop trigger if exists accounting_capture on public.%I',t);
  execute format('create trigger accounting_capture after insert or update or delete on public.%I for each row execute function public.accounting_capture()',t);
 end loop;
end $$;

create or replace function public.accounting_pay_expense(p_staff_id uuid,p_expense_id uuid,p_request uuid,p_amount numeric,p_account text,p_date date,p_owner text default '',p_reference text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.expenses; paid numeric; person text; existing public.accounting_expense_payments;
begin
 select name into person from public.staff where id=p_staff_id and active;
 if not found then raise exception 'An active staff account is required.';end if;
 if p_amount is null or round(p_amount,2)<=0 or p_account is null or p_account not in ('cash','bank','owner') or p_date is null or p_request is null then raise exception 'Enter a payment amount, date and cash/bank account.';end if;
 if p_date>(now() at time zone 'Asia/Kathmandu')::date then raise exception 'A payment cannot be recorded in the future.';end if;
 if p_account='owner' and nullif(trim(p_owner),'') is null then raise exception 'Enter the owner/partner who paid personally.';end if;
 select * into e from public.expenses where id=p_expense_id for update;
 if not found or e.voided_at is not null or coalesce(e.notes,'') like '%[Settlement:%' then raise exception 'Use an active operating/capital expense. Food partner payments belong in Food Sources & Partners.';end if;
 select * into existing from public.accounting_expense_payments where id=p_request;
 if found then
  if existing.expense_id<>p_expense_id or existing.amount<>round(p_amount,2) or existing.account<>p_account or existing.payment_date<>p_date or existing.owner_name<>coalesce(trim(p_owner),'') or existing.reference<>coalesce(p_reference,'') or existing.voided_at is not null then raise exception 'Payment request already used. Reopen the payment form.';end if;return p_request;
 end if;
 select coalesce(sum(amount),0) into paid from public.accounting_expense_payments where expense_id=p_expense_id and voided_at is null;
 if paid+round(p_amount,2)>e.amount then raise exception 'Payment exceeds outstanding balance of %.',e.amount-paid;end if;
 insert into public.accounting_expense_payments(id,expense_id,amount,account,owner_name,payment_date,reference,staff_name) values(p_request,p_expense_id,round(p_amount,2),p_account,coalesce(trim(p_owner),''),p_date,coalesce(p_reference,''),person);
 return p_request;
end $$;
create or replace function public.accounting_record_expense(p_staff_id uuid,p_request uuid,p_item jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare person text; role_name text; v_id uuid; amount numeric; paid numeric; kind text; old_payload jsonb;
begin
 select name,role into person,role_name from public.staff where id=p_staff_id and active;if not found then raise exception 'An active staff account is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_request::text,0));
 select id,request_payload into v_id,old_payload from public.expenses where request_id=p_request;
 if found then if old_payload<>p_item then raise exception 'This request was already saved. Reopen the form for a different expense.';end if;return v_id;end if;
 amount:=round((p_item->>'amount')::numeric,2);paid:=round(coalesce((p_item->>'paid_amount')::numeric,0),2);kind:=coalesce(p_item->>'kind','operating');
 if nullif(trim(p_item->>'title'),'') is null or amount is null or amount<=0 or paid<0 or paid>amount or p_request is null or kind not in ('operating','capital') then raise exception 'Enter a description, valid expense amount and amount paid (zero is allowed).';end if;
 if kind='capital' and role_name<>'admin' then raise exception 'Only admins may record capital expenditure.';end if;
 if (p_item->>'date')::date>(now() at time zone 'Asia/Kathmandu')::date then raise exception 'Incurred dates cannot be in the future; use the payment due date for upcoming bills.';end if;
 if coalesce(p_item->>'notes','') like '%[Settlement:%' then raise exception 'Supplier settlement tags are reserved for Food Sources & Partners.';end if;
 if p_item->>'category'='Partner Payout' then raise exception 'Record partner supplier bill payments from Food Sources & Partners.';end if;
 insert into public.expenses(title,category,amount,payment_source,type,paid_by,created_by,expense_date,date,notes,vendor,due_date,accounting_kind,accounting_managed,request_id,request_payload)
 values(trim(p_item->>'title'),coalesce(p_item->>'category','Other operating expenses'),amount,'cafe_revenue',case when kind='capital' then 'setup' else 'ongoing' end,person,person,
 ((p_item->>'date')::date::timestamp at time zone 'Asia/Kathmandu'),(p_item->>'date')::date,coalesce(p_item->>'notes',''),coalesce(p_item->>'vendor',''),nullif(p_item->>'due_date','')::date,kind,true,p_request,p_item) returning id into v_id;
 if paid>0 then perform public.accounting_pay_expense(p_staff_id,v_id,p_request,paid,p_item->>'account',coalesce(nullif(p_item->>'payment_date','')::date,(p_item->>'date')::date),coalesce(p_item->>'owner',''),coalesce(p_item->>'notes',''));end if;
 return v_id;
end $$;
create or replace function public.accounting_record_transaction(p_staff_id uuid,p_request uuid,p_kind text,p_from text,p_to text,p_amount numeric,p_party text,p_date date,p_reference text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare person text; balance numeric; target text; existing public.accounting_transactions;
begin
 select name into person from public.staff where id=p_staff_id and active and role='admin';if not found then raise exception 'An active admin is required.';end if;
 if p_request is null or p_amount is null or round(p_amount,2)<=0 or p_date is null or nullif(trim(p_reference),'') is null then raise exception 'Enter an amount, date and reference.';end if;
 perform pg_advisory_xact_lock(hashtextextended('accounting-transaction:'||p_request::text,0));
 select * into existing from public.accounting_transactions where id=p_request;
 if found then if existing.kind<>p_kind or existing.amount<>round(p_amount,2) or existing.from_account is distinct from p_from or existing.to_account is distinct from p_to or existing.party<>coalesce(p_party,'') or existing.business_date<>p_date or existing.reference<>trim(p_reference) then raise exception 'Transaction request already used.';end if;return p_request;end if;
 if p_date>(now() at time zone 'Asia/Kathmandu')::date then raise exception 'An actual money movement cannot be dated in the future.';end if;
 if p_kind in ('owner_loan','capital') and nullif(trim(p_party),'') is null then raise exception 'Enter the contributing owner/partner name.';end if;
 if p_kind='transfer' and (p_from not in ('cash','bank') or p_to not in ('cash','bank') or p_from=p_to or p_from is null or p_to is null) then raise exception 'Choose different cash and bank accounts.';end if;
 if p_kind in ('other_receipt','owner_loan','capital') and (p_to is null or p_to not in ('cash','bank')) then raise exception 'Choose the account receiving money.';end if;
 if p_kind in ('owner_reimbursement','loan_repayment') then
  if p_from is null or p_from not in ('cash','bank') or nullif(trim(p_party),'') is null then raise exception 'Choose the paying account and owner.';end if;
  perform pg_advisory_xact_lock(hashtextextended('owner:'||p_party,0));target:=case when p_kind='owner_reimbursement' then 'owner_payable' else 'owner_loan' end;
  select coalesce(sum(credit-debit),0) into balance from public.accounting_lines where account=target and party=p_party;
  if round(p_amount,2)>balance then raise exception 'Payment exceeds the amount owed to this owner (%).',balance;end if;
 end if;
 insert into public.accounting_transactions values(p_request,p_kind,p_from,p_to,round(p_amount,2),coalesce(p_party,''),p_date,trim(p_reference),person,now());
 return p_request;
end $$;
create or replace function public.accounting_reconcile(p_staff_id uuid,p_request uuid,p_cash numeric,p_bank numeric,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare person text; cash_now numeric; bank_now numeric;
begin
 select name into person from public.staff where id=p_staff_id and active and role='admin';if not found then raise exception 'An active admin is required.';end if;
 if p_request is null or p_cash is null or p_bank is null or p_cash<0 or p_bank<0 or nullif(trim(p_reason),'') is null then raise exception 'Enter counted cash, bank balance and a reconciliation reference.';end if;
 -- Block concurrent journal writes while taking the counted balance snapshot.
 lock table public.accounting_lines in share row exclusive mode;
 if exists(select 1 from public.accounting_balance_checks where id=p_request) then
  if exists(select 1 from public.accounting_balance_checks where id=p_request and (cash_count<>p_cash or bank_count<>p_bank or reason<>p_reason)) then raise exception 'This count request was already saved. Reopen Reconcile for a new count.';end if;return;end if;
 select coalesce(sum(debit-credit) filter(where account='cash'),0),coalesce(sum(debit-credit) filter(where account='bank'),0) into cash_now,bank_now from public.accounting_lines l join public.accounting_entries e on e.id=l.entry_id where e.business_date<=(now() at time zone 'Asia/Kathmandu')::date;
 insert into public.accounting_balance_checks values(p_request,p_cash,p_bank,p_cash-cash_now,p_bank-bank_now,p_reason,person,now());
 perform public.accounting_post_state('balance_check',p_request::text,p_reason,jsonb_build_object('cash',round(p_cash-cash_now,2),'bank',round(p_bank-bank_now,2),'opening_equity',-round(p_cash-cash_now+p_bank-bank_now,2)));
end $$;
create or replace function public.accounting_void_expense(p_staff_id uuid,p_expense uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.staff where id=p_staff_id and active and role='admin') then raise exception 'An active admin is required.';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Enter a correction reason.';end if;
 perform 1 from public.expenses where id=p_expense and coalesce(notes,'') not like '%[Settlement:%' for update;
 if not found then raise exception 'Correct food supplier payments in Food Sources & Partners.';end if;
 update public.accounting_expense_payments set voided_at=now(),void_reason=p_reason where expense_id=p_expense and voided_at is null;
 update public.expenses set voided_at=now(),void_reason=p_reason where id=p_expense and voided_at is null;
end $$;
create or replace function public.accounting_expense_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare paid numeric;
begin
 if TG_OP='DELETE' and exists(select 1 from public.accounting_expense_payments where expense_id=OLD.id) then raise exception 'Keep the audit trail. Use Void in Accounting to correct this expense.';end if;
 if TG_OP='UPDATE' then
  select coalesce(sum(amount),0) into paid from public.accounting_expense_payments where expense_id=OLD.id and voided_at is null;
  if NEW.amount<paid then raise exception 'Expense cannot be less than its recorded payments.';end if;
 end if;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
drop trigger if exists accounting_expense_guard on public.expenses;
create trigger accounting_expense_guard before update or delete on public.expenses for each row execute function public.accounting_expense_guard();

create or replace function public.accounting_payment_date_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if NEW.voided_at is null and NEW.payment_date>(now() at time zone 'Asia/Kathmandu')::date then raise exception 'Record actual payments only. A payment date cannot be in the future.';end if;return NEW;
end $$;
drop trigger if exists accounting_payment_date_guard on public.food_partner_payments;
create trigger accounting_payment_date_guard before insert or update on public.food_partner_payments for each row execute function public.accounting_payment_date_guard();
do $$ declare t text;begin
 foreach t in array array['accounting_settings','accounting_entries','accounting_lines','accounting_balance_checks','accounting_expense_payments','accounting_transactions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists accounting_read on public.%I',t);
  execute format('create policy accounting_read on public.%I for select using(true)',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to anon,authenticated',t);
 end loop;
end $$;
alter table public.accounting_source_state enable row level security;
revoke all on public.accounting_source_state from anon,authenticated;
revoke all on function public.accounting_post_state(text,text,text,jsonb,date),public.accounting_capture(),public.accounting_record_expense(uuid,uuid,jsonb),public.accounting_pay_expense(uuid,uuid,uuid,numeric,text,date,text,text),public.accounting_record_transaction(uuid,uuid,text,text,text,numeric,text,date,text),public.accounting_reconcile(uuid,uuid,numeric,numeric,text),public.accounting_void_expense(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.accounting_record_expense(uuid,uuid,jsonb),public.accounting_pay_expense(uuid,uuid,uuid,numeric,text,date,text,text),public.accounting_record_transaction(uuid,uuid,text,text,text,numeric,text,date,text),public.accounting_reconcile(uuid,uuid,numeric,numeric,text),public.accounting_void_expense(uuid,uuid,text) to anon,authenticated;
do $$ declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['accounting_entries','accounting_expense_payments','accounting_balance_checks','accounting_transactions'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;end if;
end $$;
commit;
