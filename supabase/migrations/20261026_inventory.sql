-- Native inventory for ChillPill. Run once in Supabase SQL Editor.
-- Existing menu/session data is retained. No historical orders are deducted.
begin;
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sku text,
  category text not null default 'Food & drinks',
  unit text not null default 'pcs' check (length(trim(unit)) > 0),
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  issued_quantity numeric(14,3) not null default 0 check (issued_quantity >= 0),
  reorder_level numeric(14,3) not null default 5 check (reorder_level >= 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  supplier text,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  units_per_sale numeric(14,3) not null default 1 check (units_per_sale > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.inventory_items add column if not exists issued_quantity numeric(14,3) not null default 0 check (issued_quantity >= 0);
create unique index if not exists inventory_sku_unique on public.inventory_items(lower(sku)) where sku is not null;
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  session_id uuid, -- Retain the audit trail if a session is deleted.
  movement_type text not null check (movement_type in ('opening','restock','usage','waste','adjustment','sale','return')),
  quantity_change numeric(14,3) not null check (quantity_change <> 0),
  balance_after numeric(14,3) not null check (balance_after >= 0),
  unit_cost numeric(14,2) not null default 0,
  reason text not null,
  staff_id uuid references public.staff(id) on delete set null,
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_recent on public.inventory_movements(created_at desc);
create index if not exists inventory_movements_item on public.inventory_movements(item_id, created_at desc);
create table if not exists public.inventory_session_stock (
  session_id uuid not null references public.sessions(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  quantity numeric(14,3) not null check (quantity >= 0),
  primary key(session_id,item_id)
);

-- These functions follow the console's existing staff-ID login model.
create or replace function public.inventory_save_item(p_staff_id uuid, p_item jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_opening numeric; v_staff text; v_existing public.inventory_items;
begin
  select name into v_staff from public.staff where id=p_staff_id and active and role='admin';
  if not found then raise exception 'An active admin is required to manage inventory items.'; end if;
  if nullif(trim(p_item->>'name'),'') is null then raise exception 'Item name is required.'; end if;
  if p_item->>'category'='Gaming equipment' and nullif(p_item->>'menu_item_id','') is not null then
    raise exception 'Gaming equipment uses issue/return movements, not menu sales.';
  end if;
  if nullif(p_item->>'id','') is null then
    v_opening := coalesce((p_item->>'opening_stock')::numeric,0);
    if v_opening < 0 then raise exception 'Opening stock cannot be negative.'; end if;
    insert into public.inventory_items(name,sku,category,unit,reorder_level,unit_cost,supplier,menu_item_id,units_per_sale)
    values(trim(p_item->>'name'),nullif(trim(p_item->>'sku'),''),coalesce(nullif(trim(p_item->>'category'),''),'Food & drinks'),
      coalesce(nullif(trim(p_item->>'unit'),''),'pcs'),coalesce((p_item->>'reorder_level')::numeric,5),
      coalesce((p_item->>'unit_cost')::numeric,0),nullif(trim(p_item->>'supplier'),''),nullif(p_item->>'menu_item_id','')::uuid,
      coalesce((p_item->>'units_per_sale')::numeric,1)) returning id into v_id;
    if v_opening > 0 then
      update public.inventory_items set quantity=v_opening where id=v_id;
      insert into public.inventory_movements(item_id,movement_type,quantity_change,balance_after,unit_cost,reason,staff_id,staff_name)
      values(v_id,'opening',v_opening,v_opening,coalesce((p_item->>'unit_cost')::numeric,0),'Opening stock',p_staff_id,v_staff);
    end if;
  else
    v_id := (p_item->>'id')::uuid;
    select * into v_existing from public.inventory_items where id=v_id for update;
    if not found then raise exception 'Inventory item no longer exists.'; end if;
    if v_existing.issued_quantity > 0 and (coalesce((p_item->>'active')::boolean,true)=false or p_item->>'category' <> v_existing.category or p_item->>'unit' <> v_existing.unit) then
      raise exception 'Return issued equipment before archiving it or changing its unit/category.';
    end if;
    if (v_existing.menu_item_id is distinct from nullif(p_item->>'menu_item_id','')::uuid or
        v_existing.units_per_sale <> coalesce((p_item->>'units_per_sale')::numeric,1) or
        v_existing.unit <> p_item->>'unit') and exists(
      select 1 from public.inventory_session_stock a join public.sessions s on s.id=a.session_id
      where a.item_id=v_id and a.quantity > 0 and s.status in ('Active','Booked')) then
      raise exception 'Finish the linked active orders before changing this item unit or menu link.';
    end if;
    update public.inventory_items set name=trim(p_item->>'name'),sku=nullif(trim(p_item->>'sku'),''),
      category=coalesce(nullif(trim(p_item->>'category'),''),'Food & drinks'),unit=coalesce(nullif(trim(p_item->>'unit'),''),'pcs'),
      reorder_level=(p_item->>'reorder_level')::numeric,unit_cost=(p_item->>'unit_cost')::numeric,
      supplier=nullif(trim(p_item->>'supplier'),''),menu_item_id=nullif(p_item->>'menu_item_id','')::uuid,
      units_per_sale=coalesce((p_item->>'units_per_sale')::numeric,1),active=coalesce((p_item->>'active')::boolean,true)
      where id=v_id;
  end if;
  return v_id;
end $$;

create or replace function public.inventory_adjust_stock(p_staff_id uuid,p_item_id uuid,p_type text,p_quantity numeric,p_reason text,p_unit_cost numeric default null)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare v_staff text; v_item public.inventory_items; v_change numeric; v_balance numeric;
begin
  select name into v_staff from public.staff where id=p_staff_id and active;
  if not found then raise exception 'An active staff account is required.'; end if;
  if p_type not in ('restock','usage','waste','adjustment','return') or p_type is null then raise exception 'Invalid movement type.'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'Add a reason for this stock change.'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'Quantity must be zero or greater.'; end if;
  if p_type <> 'adjustment' and p_quantity=0 then raise exception 'Quantity must be greater than zero.'; end if;
  select * into v_item from public.inventory_items where id=p_item_id and active for update;
  if not found then raise exception 'Choose an active inventory item.'; end if;
  v_change := case when p_type='adjustment' then round(p_quantity,3)-v_item.quantity
    when p_type in ('usage','waste') then -round(p_quantity,3) else round(p_quantity,3) end;
  v_balance := v_item.quantity+v_change;
  if v_balance < 0 then raise exception 'Insufficient stock for %. Available: % %.',v_item.name,v_item.quantity,v_item.unit; end if;
  if p_unit_cost < 0 then raise exception 'Unit cost cannot be negative.'; end if;
  if v_item.category='Gaming equipment' and p_type='return' and round(p_quantity,3)>v_item.issued_quantity then
    raise exception 'Only % % are currently issued. Check the return quantity.',v_item.issued_quantity,v_item.unit;
  end if;
  if v_change=0 then return v_balance; end if;
  update public.inventory_items set quantity=v_balance,
    issued_quantity=case when category='Gaming equipment' and p_type='usage' then issued_quantity+round(p_quantity,3)
      when category='Gaming equipment' and p_type='return' then issued_quantity-round(p_quantity,3) else issued_quantity end,
    unit_cost=case when p_type='restock' then coalesce(p_unit_cost,unit_cost) else unit_cost end where id=p_item_id;
  insert into public.inventory_movements(item_id,movement_type,quantity_change,balance_after,unit_cost,reason,staff_id,staff_name)
  values(p_item_id,p_type,v_change,v_balance,coalesce(p_unit_cost,v_item.unit_cost),trim(p_reason),p_staff_id,v_staff);
  return v_balance;
end $$;

-- Delta-based stock accounting runs in the SAME transaction as every session write.
-- Unrelated edits/checkout cannot deduct twice. Cancellation/deletion restores allocated stock.
create or replace function public.inventory_track_session()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.inventory_items; v_old_food jsonb := '[]'; v_new_food jsonb := '[]';
  v_old numeric; v_new numeric; v_allocated numeric; v_target numeric; v_delta numeric; v_balance numeric;
  v_session uuid; v_staff uuid; v_name text;
begin
  if TG_OP <> 'INSERT' then
    v_session:=OLD.id; v_staff:=OLD.staff_id; v_name:=OLD.staff_name;
    if OLD.status <> 'Cancelled' then v_old_food:=coalesce(OLD.food_items,'[]'); end if;
  end if;
  if TG_OP <> 'DELETE' then
    v_session:=NEW.id; v_staff:=NEW.staff_id; v_name:=NEW.staff_name;
    if NEW.status <> 'Cancelled' then v_new_food:=coalesce(NEW.food_items,'[]'); end if;
  end if;
  -- Deterministic lock order prevents two multi-item orders deadlocking each other.
  for v_item in select i.* from public.inventory_items i
    where (i.active and exists(select 1 from jsonb_array_elements(v_old_food || v_new_food) f where f->>'id'=i.menu_item_id::text)) or exists(
      select 1 from public.inventory_session_stock a where a.session_id=v_session and a.item_id=i.id and a.quantity>0)
    order by i.id for update
  loop
    select coalesce(sum(greatest(0,(f->>'qty')::numeric)),0) into v_old from jsonb_array_elements(v_old_food) f where f->>'id'=v_item.menu_item_id::text;
    select coalesce(sum(greatest(0,(f->>'qty')::numeric)),0) into v_new from jsonb_array_elements(v_new_food) f where f->>'id'=v_item.menu_item_id::text;
    select quantity into v_allocated from public.inventory_session_stock where session_id=v_session and item_id=v_item.id;
    v_allocated:=coalesce(v_allocated,0);
    v_target:=case when TG_OP='DELETE' or (TG_OP<>'DELETE' and NEW.status='Cancelled') then 0
      else greatest(0,v_allocated+(v_new-v_old)*v_item.units_per_sale) end;
    if not v_item.active then v_target:=least(v_target,v_allocated); end if;
    v_target:=round(v_target,3);
    v_delta:=v_target-v_allocated;
    if v_delta=0 then continue; end if;
    v_balance:=v_item.quantity-v_delta;
    if v_balance<0 then raise exception 'Insufficient stock for %. Available: % %.',v_item.name,v_item.quantity,v_item.unit; end if;
    update public.inventory_items set quantity=v_balance where id=v_item.id;
    insert into public.inventory_movements(item_id,session_id,movement_type,quantity_change,balance_after,unit_cost,reason,staff_id,staff_name)
    values(v_item.id,v_session,case when v_delta>0 then 'sale' else 'return' end,-v_delta,v_balance,v_item.unit_cost,
      case when TG_OP='DELETE' then 'Session deleted: stock returned' when v_delta>0 then 'Food order added' else 'Food order reduced or cancelled' end,
      v_staff,coalesce(nullif(v_name,''),'Session order'));
    if TG_OP<>'DELETE' then
      insert into public.inventory_session_stock(session_id,item_id,quantity) values(v_session,v_item.id,v_target)
      on conflict(session_id,item_id) do update set quantity=excluded.quantity;
    end if;
  end loop;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
-- BEFORE DELETE retains allocations until stock has been restored.
drop trigger if exists inventory_session_sales on public.sessions;
create trigger inventory_session_sales after insert or update of food_items,status on public.sessions for each row execute function public.inventory_track_session();
drop trigger if exists inventory_session_returns on public.sessions;
create trigger inventory_session_returns before delete on public.sessions for each row execute function public.inventory_track_session();

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_session_stock enable row level security;
drop policy if exists inventory_items_read on public.inventory_items;
create policy inventory_items_read on public.inventory_items for select using(true);
drop policy if exists inventory_movements_read on public.inventory_movements;
create policy inventory_movements_read on public.inventory_movements for select using(true);
revoke all on public.inventory_items, public.inventory_movements, public.inventory_session_stock from anon,authenticated;
grant select on public.inventory_items,public.inventory_movements to anon,authenticated;
revoke all on function public.inventory_save_item(uuid,jsonb),public.inventory_adjust_stock(uuid,uuid,text,numeric,text,numeric),public.inventory_track_session() from public;
grant execute on function public.inventory_save_item(uuid,jsonb),public.inventory_adjust_stock(uuid,uuid,text,numeric,text,numeric) to anon,authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='inventory_items') then alter publication supabase_realtime add table public.inventory_items; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='inventory_movements') then alter publication supabase_realtime add table public.inventory_movements; end if;
  end if;
end $$;
commit;
