-- Admin corrections and shared partner commitments. Requires 20261027_accounting.sql.
begin;
create table if not exists public.accounting_partners(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name))>0),committed_amount numeric(16,2) not null default 0 check(committed_amount>=0),notes text not null default '',updated_at timestamptz not null default now()
);
create unique index if not exists accounting_partners_name on public.accounting_partners(lower(trim(name)));
create table if not exists public.accounting_corrections(
 id uuid primary key,entity text not null,record_id uuid not null,before_data jsonb,after_data jsonb,item jsonb not null,reason text not null,staff_name text not null,created_at timestamptz not null default now()
);
alter table public.capital_contributions add column if not exists voided_at timestamptz;
alter table public.capital_contributions add column if not exists void_reason text;
alter table public.capital_contributions add column if not exists accounting_historical boolean;
update public.capital_contributions set accounting_historical=created_at<=(select tracking_started_at from public.accounting_settings where id=1) where accounting_historical is null;
alter table public.capital_contributions alter column accounting_historical set default true;
alter table public.capital_contributions alter column accounting_historical set not null;
alter table public.accounting_expense_payments add column if not exists accounting_historical boolean;
update public.accounting_expense_payments p set accounting_historical=p.legacy and e.created_at<=(select tracking_started_at from public.accounting_settings where id=1) from public.expenses e where e.id=p.expense_id and p.accounting_historical is null;
alter table public.accounting_expense_payments alter column accounting_historical set default false;
alter table public.accounting_expense_payments alter column accounting_historical set not null;
alter table public.accounting_transactions add column if not exists voided_at timestamptz;
alter table public.accounting_transactions add column if not exists void_reason text;
insert into public.accounting_partners(name)
 select distinct on(lower(trim(name))) trim(name) from (
 select partner_name name from public.capital_contributions union all select party from public.accounting_transactions where kind='capital'
 ) names where nullif(trim(name),'') is not null on conflict do nothing;

alter table public.expenses add column if not exists accounting_reimbursement_offset numeric;
update public.expenses set accounting_reimbursement_offset=amount where payment_source='partner_personal' and reimbursement_status='reimbursed' and accounting_reimbursement_offset is null;
create or replace function public.accounting_expense_postings(r jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare value numeric; state jsonb;begin
 if r->>'voided_at' is not null then return '{}';end if;
 value:=(r->>'amount')::numeric;
 state:=jsonb_build_object(case when r->>'accounting_kind'='capital' or r->>'type'='setup' then 'capital_asset' else 'operating_expense' end,value,'expense_payable',-value);
 if r->>'payment_source'='partner_personal' and r->>'reimbursement_status'='reimbursed' then
  state:=state||jsonb_build_object('owner_payable::'||coalesce(r->>'paid_by_partner_name',''),coalesce((r->>'accounting_reimbursement_offset')::numeric,value),'unclassified',-coalesce((r->>'accounting_reimbursement_offset')::numeric,value));
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
     d:=coalesce((r->>'expense_date')::timestamptz at time zone 'Asia/Kathmandu',now() at time zone 'Asia/Kathmandu')::date;
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


create or replace function public.accounting_edit_state(typ text,r jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare target text;
begin
 if r is null or r->>'voided_at' is not null then return '{}';end if;
 if typ='capital' then
  target:=case when (r->>'accounting_historical')::boolean then 'opening_equity' else coalesce(r->>'receiving_account','unclassified') end;
  return jsonb_build_object(target,(r->>'amount')::numeric,'capital',-(r->>'amount')::numeric);
 elsif typ='payment' then
  target:=case when r->>'account'='owner' then 'owner_payable::'||(r->>'owner_name') when (r->>'accounting_historical')::boolean then 'unclassified' else r->>'account' end;
  return jsonb_build_object('expense_payable',(r->>'amount')::numeric,target,-(r->>'amount')::numeric);
 elsif typ='transaction' then
  target:=case r->>'kind' when 'owner_reimbursement' then 'owner_payable::'||(r->>'party') when 'loan_repayment' then 'owner_loan::'||(r->>'party') else r->>'to_account' end;
  return jsonb_build_object(target,(r->>'amount')::numeric,case r->>'kind' when 'owner_loan' then 'owner_loan::'||(r->>'party') when 'other_receipt' then 'other_income' when 'capital' then 'capital' else r->>'from_account' end,-(r->>'amount')::numeric);
 end if;raise exception 'Unsupported accounting source';
end $$;
create or replace function public.accounting_edit_capture() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb;typ text;d date;description text;
begin
 if TG_OP='DELETE' then r:=to_jsonb(old);else r:=to_jsonb(new);end if;
 typ:=case TG_TABLE_NAME when 'capital_contributions' then 'capital' when 'accounting_expense_payments' then 'payment' else 'transaction' end;
 d:=coalesce((r->>'contribution_date')::date,(r->>'payment_date')::date,(r->>'business_date')::date);
 description:=case typ when 'capital' then 'Capital: '||(r->>'partner_name') when 'payment' then 'Expense payment: '||coalesce((select title from public.expenses where id=(r->>'expense_id')::uuid),'Expense') else replace(r->>'kind','_',' ')||': '||coalesce(r->>'party','')||' '||coalesce(r->>'reference','') end;
 perform public.accounting_post_state(TG_TABLE_NAME,r->>'id',description,case when TG_OP='DELETE' then '{}'::jsonb else public.accounting_edit_state(typ,r) end,d);
 if TG_OP='DELETE' then return old;else return new;end if;
end $$;
-- Old balances were counted, not replayed. Historical account labels never create a fresh cash receipt/payment.
update public.accounting_source_state s set postings=public.accounting_edit_state('capital',to_jsonb(c)) from public.capital_contributions c where s.source_type='capital_contributions' and s.source_id=c.id::text and c.accounting_historical;
update public.accounting_source_state s set postings=public.accounting_edit_state('payment',to_jsonb(p)) from public.accounting_expense_payments p where s.source_type='accounting_expense_payments' and s.source_id=p.id::text and p.accounting_historical;
-- Bring known pre-ledger owner equity forward once, without replaying cash/bank.
do $$ declare c public.capital_contributions;booked numeric;opening numeric;begin
 for c in select * from public.capital_contributions where accounting_historical loop
  if not exists(select 1 from public.accounting_source_state where source_type='opening_capital' and source_id=c.id::text) then
   select coalesce(sum(l.credit-l.debit),0) into booked from public.accounting_lines l join public.accounting_entries e on e.id=l.entry_id where e.source_type='capital_contributions' and e.source_id=c.id::text and l.account='capital';
   opening:=case when c.voided_at is null then c.amount else 0 end-booked;
   perform public.accounting_post_state('opening_capital',c.id::text,'Historical owner equity: '||c.partner_name,jsonb_build_object('opening_equity',opening,'capital',-opening),(select (tracking_started_at at time zone 'Asia/Kathmandu')::date from public.accounting_settings where id=1));
  end if;
 end loop;
end $$;
do $$ declare t text;begin foreach t in array array['capital_contributions','accounting_expense_payments','accounting_transactions'] loop
 execute format('drop trigger if exists accounting_capture on public.%I',t);
 execute format('create trigger accounting_capture after insert or update or delete on public.%I for each row execute function public.accounting_edit_capture()',t);
end loop;end $$;

create or replace function public.accounting_admin_save(p_staff_id uuid,p_request uuid,p_entity text,p_id uuid,p_expected jsonb,p_item jsonb,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
<<admin_save>>
declare actor text;t text;before_row jsonb;after_row jsonb;previous public.accounting_corrections;e public.expenses;paid numeric;amount numeric;d date;k text;old_owner text;new_owner text;v_state jsonb;v_date date;owners text[];person text;
begin
 select name into actor from public.staff where id=p_staff_id and active and role='admin';if not found then raise exception 'An active admin is required.';end if;
 if p_request is null or p_id is null or nullif(trim(p_reason),'') is null then raise exception 'Enter a correction reason.';end if;
 perform pg_advisory_xact_lock(hashtextextended('accounting-admin-request:'||p_request,0));
 select * into previous from public.accounting_corrections where id=p_request;
 if found then if previous.entity<>p_entity or previous.record_id<>p_id or previous.item<>p_item or previous.reason<>trim(p_reason) then raise exception 'This correction request was already used. Reopen the form.';end if;return p_id;end if;
 t:=case p_entity when 'expense' then 'expenses' when 'payment' then 'accounting_expense_payments' when 'capital' then 'capital_contributions' when 'transaction' then 'accounting_transactions' when 'partner' then 'accounting_partners' end;
 if t is null then raise exception 'Unsupported accounting record.';end if;
 -- Serialize financial corrections and normal invoice payments on the same invoice.
 if p_entity='payment' then
  select x.* into e from public.expenses x join public.accounting_expense_payments p on p.expense_id=x.id where p.id=p_id for update of x;
  if not found or e.voided_at is not null or coalesce(e.notes,'') like '%[Settlement:%' then raise exception 'Use an active expense invoice. Correct supplier payments in Food Sources & Partners.';end if;
 end if;
 execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into before_row using p_id;
 if before_row is distinct from p_expected then raise exception 'This record changed since you opened it. Refresh and reopen before saving.';end if;
 if before_row is null and p_entity not in ('capital','partner') then raise exception 'Record not found.';end if;
 if before_row->>'voided_at' is not null then raise exception 'Voided records remain in the audit history and cannot be edited.';end if;
 if before_row is null and coalesce((p_item->>'void')::boolean,false) then raise exception 'Cannot void an unsaved record.';end if;
 amount:=round((p_item->>'amount')::numeric,2);d:=nullif(p_item->>'date','')::date;
 if p_entity<>'partner' and not coalesce((p_item->>'void')::boolean,false) and (amount is null or amount<=0 or d is null or d>(now() at time zone 'Asia/Kathmandu')::date) then raise exception 'Enter a positive amount and a date that is not in the future.';end if;
 if p_entity='payment' then owners:=array[before_row->>'owner_name',p_item->>'owner'];
 elsif p_entity='transaction' then owners:=array[before_row->>'party',p_item->>'party'];
 elsif p_entity='expense' then select array_agg(distinct owner_name) into owners from public.accounting_expense_payments where expense_id=p_id and account='owner' and voided_at is null;end if;
 for person in select distinct x from unnest(owners) x where nullif(trim(x),'') is not null order by x loop perform pg_advisory_xact_lock(hashtextextended('owner:'||person,0));end loop;
 -- Repost financial sources at the corrected source date. Reversals retain the old date.
 if before_row is not null and p_entity<>'partner' then
  v_date:=coalesce((before_row->>'payment_date')::date,(before_row->>'contribution_date')::date,(before_row->>'business_date')::date,(before_row->>'date')::date);
  perform public.accounting_post_state(t,p_id::text,'Correction reversal: '||trim(p_reason),'{}',v_date);
 end if;
 if p_entity='expense' then
  if (p_item->>'reimbursed')::numeric<0 then raise exception 'Historical reimbursed amount cannot be negative.';end if;
  if coalesce(before_row->>'notes','') like '%[Settlement:%' or p_item->>'category'='Partner Payout' or coalesce(p_item->>'notes','') like '%[Settlement:%' then raise exception 'Supplier bills and payments are edited in Food Sources & Partners.';end if;
  if coalesce((p_item->>'void')::boolean,false) then
   update public.accounting_expense_payments set voided_at=now(),void_reason=trim(p_reason) where expense_id=p_id and voided_at is null;
   update public.expenses set voided_at=now(),void_reason=trim(p_reason) where id=p_id;
  else
   if nullif(trim(p_item->>'title'),'') is null or nullif(trim(p_item->>'category'),'') is null or p_item->>'kind' not in ('operating','capital') then raise exception 'Enter an invoice description, category and classification.';end if;
   select coalesce(sum(p.amount),0) into paid from public.accounting_expense_payments p where p.expense_id=p_id and p.voided_at is null;
   if amount<paid then raise exception 'Invoice total cannot be below payments (%). Correct payment history first.',paid;end if;
   update public.expenses set title=trim(p_item->>'title'),category=trim(p_item->>'category'),vendor=coalesce(p_item->>'vendor',''),amount=admin_save.amount,
    accounting_kind=p_item->>'kind',type=case p_item->>'kind' when 'capital' then 'setup' else 'ongoing' end,date=d,expense_date=d::timestamp at time zone 'Asia/Kathmandu',due_date=nullif(p_item->>'due_date','')::date,notes=coalesce(p_item->>'notes',''),accounting_reimbursement_offset=case when accounting_reimbursement_offset is not null then coalesce((p_item->>'reimbursed')::numeric,accounting_reimbursement_offset) else null end
    where id=p_id;
  end if;
 elsif p_entity='payment' then
  old_owner:=nullif(before_row->>'owner_name','');new_owner:=nullif(trim(p_item->>'owner'),'');
  if coalesce((p_item->>'void')::boolean,false) then update public.accounting_expense_payments set voided_at=now(),void_reason=trim(p_reason) where id=p_id;
  else
   if p_item->>'account' not in ('cash','bank','owner','unclassified') or p_item->>'account' is null or (p_item->>'account'='owner' and new_owner is null) then raise exception 'Choose a payment account and name a personal payer.';end if;
   select coalesce(sum(p.amount),0) into paid from public.accounting_expense_payments p where p.expense_id=e.id and p.id<>p_id and p.voided_at is null;
   if paid+amount>e.amount then raise exception 'Payments cannot exceed the invoice total (%).',e.amount;end if;
   update public.accounting_expense_payments set amount=admin_save.amount,account=p_item->>'account',owner_name=case when p_item->>'account'='owner' then new_owner else '' end,payment_date=d,reference=coalesce(p_item->>'reference','') where id=p_id;
  end if;
 elsif p_entity='capital' then
  if coalesce((p_item->>'void')::boolean,false) then update public.capital_contributions set voided_at=now(),void_reason=trim(p_reason) where id=p_id;
  else
   if nullif(trim(p_item->>'partner'),'') is null or p_item->>'account' not in ('cash','bank','unclassified') or p_item->>'account' is null then raise exception 'Enter a partner and receiving account.';end if;
   if before_row is not null and (before_row->>'accounting_historical')::boolean is distinct from (p_item->>'historical')::boolean then raise exception 'Keep the historical/current receipt basis. Void the incorrect record and create its replacement.';end if;
   if before_row is null then insert into public.capital_contributions(id,partner_name,amount,contribution_date,notes,receiving_account,accounting_historical) values(p_id,trim(p_item->>'partner'),amount,d,coalesce(p_item->>'notes',''),p_item->>'account',coalesce((p_item->>'historical')::boolean,true));
   else update public.capital_contributions set partner_name=trim(p_item->>'partner'),amount=admin_save.amount,contribution_date=d,notes=coalesce(p_item->>'notes',''),receiving_account=p_item->>'account' where id=p_id;end if;
   insert into public.accounting_partners(name) values(trim(p_item->>'partner')) on conflict do nothing;
  end if;
 elsif p_entity='transaction' then
  old_owner:=nullif(before_row->>'party','');new_owner:=nullif(trim(p_item->>'party'),'');
  if coalesce((p_item->>'void')::boolean,false) then update public.accounting_transactions set voided_at=now(),void_reason=trim(p_reason) where id=p_id;
  else
   k:=p_item->>'kind';if k is null or k not in ('transfer','owner_reimbursement','owner_loan','loan_repayment','other_receipt','capital') then raise exception 'Choose a valid transaction classification.';end if;
   if k='transfer' and (p_item->>'from' is null or p_item->>'to' is null or p_item->>'from' not in ('cash','bank') or p_item->>'to' not in ('cash','bank') or p_item->>'from'=p_item->>'to') then raise exception 'Choose different cash and bank accounts.';end if;
   if k in ('capital','owner_loan','owner_reimbursement','loan_repayment') and new_owner is null then raise exception 'Enter the owner or partner name.';end if;
   if k in ('capital','owner_loan','other_receipt') and (p_item->>'to' is null or p_item->>'to' not in ('cash','bank')) then raise exception 'Choose the receiving account.';end if;
   if k in ('owner_reimbursement','loan_repayment') and (p_item->>'from' is null or p_item->>'from' not in ('cash','bank')) then raise exception 'Choose the paying account.';end if;
   update public.accounting_transactions set kind=k,from_account=p_item->>'from',to_account=p_item->>'to',amount=admin_save.amount,party=coalesce(new_owner,''),business_date=d,reference=coalesce(p_item->>'reference','') where id=p_id;
  end if;
 elsif p_entity='partner' then
  if nullif(trim(p_item->>'name'),'') is null or (p_item->>'committed')::numeric is null or (p_item->>'committed')::numeric<0 then raise exception 'Enter a partner name and nonnegative commitment.';end if;
  if before_row is null then insert into public.accounting_partners(id,name,committed_amount,notes) values(p_id,trim(p_item->>'name'),round((p_item->>'committed')::numeric,2),coalesce(p_item->>'notes',''));
  else
   update public.accounting_partners set name=trim(p_item->>'name'),committed_amount=round((p_item->>'committed')::numeric,2),notes=coalesce(p_item->>'notes',''),updated_at=clock_timestamp() where id=p_id;
   if lower(trim(before_row->>'name'))<>lower(trim(p_item->>'name')) or before_row->>'name'<>trim(p_item->>'name') then
    update public.capital_contributions set partner_name=trim(p_item->>'name') where lower(trim(partner_name))=lower(trim(before_row->>'name'));
    update public.accounting_transactions set party=trim(p_item->>'name') where kind='capital' and lower(trim(party))=lower(trim(before_row->>'name'));
   end if;
  end if;
 end if;
 -- Corrections cannot leave a personal reimbursement/loan overpaid. Correct the repayment first.
 if p_entity in ('expense','payment','transaction') and exists(select 1 from public.accounting_lines where account in ('owner_payable','owner_loan') and party=any(owners) group by account,party having sum(credit-debit)<0) then raise exception 'This correction would overpay a personal reimbursement or loan. Correct its repayments first.';end if;
 execute format('select to_jsonb(x) from public.%I x where id=$1',t) into after_row using p_id;
 insert into public.accounting_corrections(id,entity,record_id,before_data,after_data,item,reason,staff_name) values(p_request,p_entity,p_id,before_row,after_row,p_item,trim(p_reason),actor);
 return p_id;
end $$;

do $$ declare t text;begin foreach t in array array['accounting_partners','accounting_corrections'] loop
 execute format('alter table public.%I enable row level security',t);execute format('drop policy if exists accounting_read on public.%I',t);execute format('create policy accounting_read on public.%I for select using(true)',t);
 execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to anon,authenticated',t);
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
end loop;end $$;
revoke all on function public.accounting_edit_state(text,jsonb),public.accounting_edit_capture(),public.accounting_admin_save(uuid,uuid,text,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.accounting_admin_save(uuid,uuid,text,uuid,jsonb,jsonb,text) to anon,authenticated;
-- One consistent server snapshot, with no PostgREST table row-limit truncation.
create or replace function public.accounting_statement_data(p_staff_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.staff where id=p_staff_id and active and role='admin') then raise exception 'An active admin is required.';end if;
 return jsonb_build_object(
 'sessions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sessions x),
 'menu_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.menu_items x),
 'expenses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.expenses x),
 'accounting_settings',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_settings x),
 'accounting_entries',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_entries x),
 'accounting_lines',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_lines x),
 'accounting_balance_checks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_balance_checks x),
 'accounting_expense_payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_expense_payments x),
 'capital_contributions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.capital_contributions x),
 'accounting_transactions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_transactions x),
 'accounting_partners',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_partners x),
 'accounting_corrections',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_corrections x),
 'loyalty_visits',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.loyalty_visits x),
 'loyalty_rewards',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.loyalty_rewards x),
 'food_partner_bills',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.food_partner_bills x),
 'food_partner_payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.food_partner_payments x),
 'inventory_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.inventory_items x),
 'inventory_movements',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.inventory_movements x),
 'tournaments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.tournaments x),
 'tournament_players',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.tournament_players x)
 );
end $$;
revoke all on function public.accounting_statement_data(uuid) from public,anon,authenticated;
grant execute on function public.accounting_statement_data(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
