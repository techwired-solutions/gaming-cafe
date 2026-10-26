\set ON_ERROR_STOP on
-- Run only against an isolated test database; never against the cafe database.
do $$ begin assert current_database()='inventory_test', 'Use an isolated inventory_test database'; end $$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create table if not exists public.staff(id uuid primary key,name text,active boolean,role text);
create table if not exists public.menu_items(id uuid primary key,name text);
create table if not exists public.sessions(id uuid primary key,food_items jsonb default '[]',status text default 'Active',staff_id uuid,staff_name text);
\ir ../supabase/migrations/20261026_inventory.sql
-- Migration must be safe to re-run.
\ir ../supabase/migrations/20261026_inventory.sql
begin;
insert into public.staff values('00000000-0000-0000-0000-000000000001','Admin',true,'admin'),('00000000-0000-0000-0000-000000000002','Staff',true,'staff');
insert into public.menu_items values('00000000-0000-0000-0000-000000000010','Coke');
do $$
declare item uuid; equipment uuid; balance numeric; count_before int; historical uuid; zero_item uuid;
  admin_id uuid := '00000000-0000-0000-0000-000000000001'; staff_id uuid := '00000000-0000-0000-0000-000000000002';
  menu_id uuid := '00000000-0000-0000-0000-000000000010'; v_session_id uuid := '00000000-0000-0000-0000-000000000020';
begin
  item:=public.inventory_save_item(admin_id,jsonb_build_object('name','Coke','opening_stock',10,'menu_item_id',menu_id,'unit_cost',50));
  assert (select quantity=10 from public.inventory_items where id=item);
  assert (select count(*)=1 from public.inventory_movements where item_id=item);
  begin
    perform public.inventory_save_item(staff_id,'{"name":"Not allowed"}');
    raise exception 'Expected admin check';
  exception when others then assert SQLERRM like 'An active admin%'; end;
  perform public.inventory_adjust_stock(staff_id,item,'restock',5,'Invoice 123',55);
  assert (select quantity=15 and unit_cost=55 from public.inventory_items where id=item);
  insert into public.sessions values(v_session_id,jsonb_build_array(jsonb_build_object('id',menu_id,'qty',2)), 'Active',staff_id,'Staff');
  assert (select quantity=13 from public.inventory_items where id=item);
  select count(*) into count_before from public.inventory_movements;
  update public.sessions set status='Completed' where id=v_session_id;
  update public.sessions set food_items=food_items where id=v_session_id;
  assert (select count(*)=count_before from public.inventory_movements), 'Checkout or unchanged orders must not double deduct';
  update public.sessions set food_items=jsonb_build_array(jsonb_build_object('id',menu_id,'qty',3)) where id=v_session_id;
  assert (select quantity=12 from public.inventory_items where id=item);
  update public.sessions set food_items=jsonb_build_array(jsonb_build_object('id',menu_id,'qty',1)) where id=v_session_id;
  assert (select quantity=14 from public.inventory_items where id=item);
  begin
    update public.sessions set food_items=jsonb_build_array(jsonb_build_object('id',menu_id,'qty',99)) where id=v_session_id;
    raise exception 'Expected insufficient stock';
  exception when others then assert SQLERRM like 'Insufficient stock%'; end;
  assert (select quantity=14 from public.inventory_items where id=item);
  assert (select (food_items->0->>'qty')::int=1 from public.sessions where id=v_session_id), 'Failed order must roll back';
  update public.sessions set status='Cancelled' where id=v_session_id;
  assert (select quantity=15 from public.inventory_items where id=item);
  update public.sessions set status='Active' where id=v_session_id;
  assert (select quantity=14 from public.inventory_items where id=item);
  delete from public.sessions where id=v_session_id;
  assert (select quantity=15 from public.inventory_items where id=item);
  assert not exists(select 1 from public.inventory_session_stock where session_id=v_session_id and item_id=item);
  equipment:=public.inventory_save_item(admin_id,'{"name":"PS5 controller","category":"Gaming equipment","opening_stock":4,"unit_cost":9000}');
  perform public.inventory_adjust_stock(staff_id,equipment,'usage',2,'Issued to Station 2');
  assert (select quantity=2 and issued_quantity=2 from public.inventory_items where id=equipment);
  begin
    perform public.inventory_adjust_stock(staff_id,equipment,'return',3,'Too many returns');
    raise exception 'Expected equipment return guard';
  exception when others then assert SQLERRM like 'Only %'; end;
  perform public.inventory_adjust_stock(staff_id,equipment,'return',1,'Returned from Station 2');
  perform public.inventory_adjust_stock(staff_id,equipment,'waste',1,'Damaged controller');
  assert (select quantity=2 from public.inventory_items where id=equipment);
  perform public.inventory_adjust_stock(staff_id,equipment,'adjustment',0,'Stocktake');
  assert (select quantity=0 from public.inventory_items where id=equipment);
  begin
    perform public.inventory_adjust_stock(staff_id,equipment,'usage',1,'No stock');
    raise exception 'Expected insufficient stock';
  exception when others then assert SQLERRM like 'Insufficient stock%'; end;
  -- Linking stock later must not deduct the cafe's historical sales.
  historical:=gen_random_uuid();
  insert into public.sessions values(historical,'[{"id":"00000000-0000-0000-0000-000000000011","qty":8}]','Completed',staff_id,'Staff');
  insert into public.menu_items values('00000000-0000-0000-0000-000000000011','Water');
  zero_item:=public.inventory_save_item(admin_id,'{"name":"Water","opening_stock":10,"menu_item_id":"00000000-0000-0000-0000-000000000011"}');
  update public.sessions set food_items=food_items where id=historical;
  assert (select quantity=10 from public.inventory_items where id=zero_item);
  update public.sessions set food_items='[{"id":"00000000-0000-0000-0000-000000000011","qty":9}]' where id=historical;
  assert (select quantity=9 from public.inventory_items where id=zero_item);
  delete from public.sessions where id=historical;
  assert (select quantity=10 from public.inventory_items where id=zero_item), 'Only allocated stock may be returned';
  begin
    insert into public.sessions values(gen_random_uuid(),'[{"id":"00000000-0000-0000-0000-000000000010","qty":1},{"id":"00000000-0000-0000-0000-000000000011","qty":99}]','Active',staff_id,'Staff');
    raise exception 'Expected multi-item rollback';
  exception when others then assert SQLERRM like 'Insufficient stock%'; end;
  assert (select quantity=15 from public.inventory_items where id=item);
  assert (select quantity=10 from public.inventory_items where id=zero_item);
  assert not has_table_privilege('anon','public.inventory_items','UPDATE');
  assert not has_table_privilege('anon','public.inventory_movements','INSERT');
  assert not has_table_privilege('anon','public.inventory_movements','DELETE');
  assert has_table_privilege('anon','public.inventory_items','SELECT');
  raise notice 'PASS: creation, admin/staff access, restock, sale deltas, idempotent checkout, negative-stock rollback, cancellation/delete returns, equipment issue/return/waste/stocktake, and historical orders';
end $$;
rollback;
