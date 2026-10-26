-- ChillPill Gaming Cafe — Supabase schema
-- Run this once in Supabase Dashboard → SQL Editor → New query → paste → Run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- menu_items: food & drinks, managed from the dashboard's Admin Setup tab,
-- read by both the dashboard and the public website.
-- ---------------------------------------------------------------------
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  category text not null default 'Snacks',
  supplier text not null default 'chillpill',
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for menu_items supplier
alter table public.menu_items add column if not exists supplier text not null default 'chillpill';


-- ---------------------------------------------------------------------
-- staff: login accounts for the owner console. Passwords are hashed
-- (SHA-256 + per-user salt) client-side before ever reaching the database —
-- see the security note further down before relying on this for anything
-- beyond keeping casual visitors out.
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  password_hash text not null,
  password_salt text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- sessions: every booking / walk-in / active / completed gaming session.
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Walk-in' check (type in ('Walk-in', 'Booked')),
  station_name text not null,
  game text,
  customer_name text not null,
  customer_phone text not null,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer not null default 60,
  rate numeric not null default 100,
  food_items jsonb not null default '[]'::jsonb,
  food_total numeric not null default 0,
  amount numeric not null default 0,
  overtime_amount numeric not null default 0,
  discount_amount numeric not null default 0,
  discount_type text check (discount_type in ('percent', 'amount', 'minutes')),
  discount_value numeric not null default 0,
  status text not null default 'Active' check (status in ('Booked', 'Active', 'Completed', 'Cancelled')),
  notes text,
  notified_5min boolean not null default false,
  staff_id uuid references public.staff(id) on delete set null,
  staff_name text,
  payment_method text check (payment_method in ('Cash', 'Online', 'Split')),
  cash_amount numeric default 0,
  online_amount numeric default 0,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for databases created before staff/billing
-- columns existed — safe to re-run.
alter table public.sessions add column if not exists staff_id uuid references public.staff(id) on delete set null;
alter table public.sessions add column if not exists staff_name text;
alter table public.sessions add column if not exists payment_method text;
alter table public.sessions add column if not exists cash_amount numeric default 0;
alter table public.sessions add column if not exists online_amount numeric default 0;
do $$ begin
  alter table public.sessions drop constraint if exists sessions_payment_method_check;
  alter table public.sessions add constraint sessions_payment_method_check check (payment_method in ('Cash', 'Online', 'Split'));
exception when others then null;
end $$;
alter table public.sessions add column if not exists paid boolean not null default false;
alter table public.sessions add column if not exists paid_at timestamptz;
alter table public.sessions add column if not exists game text;
alter table public.sessions add column if not exists overtime_amount numeric not null default 0;
alter table public.sessions add column if not exists discount_amount numeric not null default 0;
alter table public.sessions add column if not exists discount_type text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_discount_type_check') then
    alter table public.sessions add constraint sessions_discount_type_check check (discount_type in ('percent', 'amount', 'minutes'));
  end if;
end $$;
alter table public.sessions add column if not exists discount_value numeric not null default 0;

alter table public.sessions add column if not exists extra_stations jsonb not null default '[]'::jsonb;
alter table public.sessions add column if not exists paid_amount numeric default 0;
alter table public.sessions add column if not exists due_amount numeric default 0;

create index if not exists sessions_status_idx on public.sessions (status);

create index if not exists sessions_end_time_idx on public.sessions (end_time);
create index if not exists sessions_staff_id_idx on public.sessions (staff_id);

-- ---------------------------------------------------------------------
-- settings: single-row table for shop-wide info editable from the
-- dashboard's Cafe Content (CMS) tab — powers both the dashboard header
-- and the public website, so the owner never has to touch code to update
-- hours, pricing, or contact info.
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id integer primary key default 1,
  default_rate numeric not null default 100,
  cafe_name text not null default 'ChillPill Gaming Cafe',
  cafe_tagline text not null default 'Console gaming, snacks & good vibes.',
  cafe_location text not null default 'Budhanilkantha, Kathmandu',
  cafe_address text not null default 'Budhanilkantha, Kathmandu, Nepal',
  opening_hours text not null default '7:00 AM – 8:00 PM · Every day',
  whatsapp_number text not null default '9779765130636',
  whatsapp_message text not null default 'Hi! I''d like to book a PlayStation slot at ChillPill Gaming Cafe.',
  pan_number text not null default '625001462',
  initial_capital numeric not null default 1500000,
  google_maps_url text not null default 'https://maps.app.goo.gl/uBQnASzc9W2igYmh6',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

-- Backward-compatible migration for databases created before new columns existed.
alter table public.settings add column if not exists default_rate numeric not null default 100;
alter table public.settings add column if not exists cafe_name text not null default 'ChillPill Gaming Cafe';
alter table public.settings add column if not exists cafe_tagline text not null default 'Console gaming, snacks & good vibes.';
alter table public.settings add column if not exists cafe_location text not null default 'Budhanilkantha, Kathmandu';
alter table public.settings add column if not exists cafe_address text not null default 'Budhanilkantha, Kathmandu, Nepal';
alter table public.settings add column if not exists opening_hours text not null default '7:00 AM – 8:00 PM · Every day';
alter table public.settings add column if not exists whatsapp_number text not null default '9779765130636';
alter table public.settings add column if not exists whatsapp_message text not null default 'Hi! I''d like to book a PlayStation slot at ChillPill Gaming Cafe.';
alter table public.settings add column if not exists pan_number text not null default '625001462';
alter table public.settings add column if not exists initial_capital numeric not null default 1500000;
alter table public.settings add column if not exists google_maps_url text not null default 'https://maps.app.goo.gl/uBQnASzc9W2igYmh6';
alter table public.settings add column if not exists linkypot_embed_code text;
alter table public.settings add column if not exists bros_burger_commission numeric not null default 20;
alter table public.settings add column if not exists bros_burger_whatsapp text not null default '9779841268666';
alter table public.settings add column if not exists bardali_commission numeric not null default 20;
alter table public.settings add column if not exists bardali_whatsapp text not null default '';


insert into public.settings (id)
values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- notices: event announcements, popups, and updates managed by admin,
-- shown on public website modal or banner.
-- ---------------------------------------------------------------------
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  badge text not null default 'Announcement',
  image_url text,
  button_text text,
  button_url text,
  popup boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for existing notices tables
alter table public.notices add column if not exists badge text not null default 'Announcement';
alter table public.notices add column if not exists image_url text;
alter table public.notices add column if not exists button_text text;
alter table public.notices add column if not exists button_url text;
alter table public.notices add column if not exists popup boolean not null default true;
alter table public.notices add column if not exists active boolean not null default true;

-- Seed soft and grand opening notice if table is empty
insert into public.notices (title, badge, message, button_text, button_url, popup, active)
select
  'Grand Opening & Soft Opening Celebration!',
  'Upcoming Opening',
  'ChillPill Gaming Cafe is opening soon! 🎮 Join us for our Soft Opening on Thursday, September 17, and celebrate our Grand Opening on Saturday, September 19. Experience private PS5 & PS4 cabins, top-tier games, specialty coffee, and mouth-watering snacks. Opening daily from 7:00 AM to 8:00 PM!',
  'Book / Inquire on WhatsApp',
  'https://wa.me/9779765130636?text=Hi!%20I%27d%20like%20to%20know%20more%20about%20the%20Grand%20Opening',
  true,
  true
where not exists (select 1 from public.notices limit 1);

-- ---------------------------------------------------------------------
-- expenses: comprehensive expense tracking for ChillPill Gaming Cafe.
-- Records who spent money, for what, when, how much, and the funding source
-- (Partner Personal money vs Cafe Revenue vs Initial Capital Pool).
-- Partners can track money paid out-of-pocket and mark reimbursements when
-- returned from cafe revenue later.
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Initial Setup & Build',
  amount numeric not null check (amount >= 0),
  payment_source text not null check (payment_source in ('partner_personal', 'cafe_revenue', 'initial_capital')),
  paid_by_partner_name text,
  reimbursement_status text not null default 'not_applicable' check (reimbursement_status in ('unreimbursed', 'reimbursed', 'not_applicable')),
  reimbursed_at timestamptz,
  reimbursed_by text,
  expense_date timestamptz not null default now(),
  notes text,
  receipt_url text,
  created_by text,
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for existing expenses tables
alter table public.expenses add column if not exists title text not null default 'Expense';
alter table public.expenses add column if not exists category text not null default 'Initial Setup & Build';
alter table public.expenses add column if not exists amount numeric not null default 0;
alter table public.expenses add column if not exists payment_source text not null default 'initial_capital';
alter table public.expenses add column if not exists paid_by_partner_name text;
alter table public.expenses add column if not exists reimbursement_status text not null default 'not_applicable';
alter table public.expenses add column if not exists reimbursed_at timestamptz;
alter table public.expenses add column if not exists reimbursed_by text;
alter table public.expenses add column if not exists expense_date timestamptz not null default now();
alter table public.expenses add column if not exists notes text;
alter table public.expenses add column if not exists receipt_url text;
alter table public.expenses add column if not exists created_by text;
alter table public.expenses add column if not exists created_at timestamptz not null default now();
alter table public.expenses add column if not exists type text not null default 'ongoing' check (type in ('setup', 'ongoing'));
alter table public.expenses add column if not exists paid_by text not null default 'Admin';
alter table public.expenses add column if not exists date date not null default CURRENT_DATE;
-- Drop check constraint on category so any free-text category value is accepted
alter table public.expenses drop constraint if exists expenses_category_check;

create index if not exists expenses_source_idx on public.expenses (payment_source);
create index if not exists expenses_reimbursement_idx on public.expenses (reimbursement_status);
create index if not exists expenses_category_idx on public.expenses (category);
create index if not exists expenses_date_idx on public.expenses (expense_date);

-- ---------------------------------------------------------------------
-- capital_contributions: tracks partner contributions to the initial
-- NPR 15 Lakhs setup capital.
-- ---------------------------------------------------------------------
create table if not exists public.capital_contributions (
  id uuid primary key default gen_random_uuid(),
  partner_name text not null,
  amount numeric not null check (amount >= 0),
  contribution_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for existing capital_contributions tables
alter table public.capital_contributions add column if not exists partner_name text not null default 'Anonymous';
alter table public.capital_contributions add column if not exists amount numeric not null default 0;
alter table public.capital_contributions add column if not exists contribution_date date not null default current_date;
alter table public.capital_contributions add column if not exists notes text;
alter table public.capital_contributions add column if not exists created_at timestamptz not null default now();

create index if not exists capital_partner_idx on public.capital_contributions (partner_name);
create index if not exists capital_date_idx on public.capital_contributions (contribution_date);

-- ---------------------------------------------------------------------
-- Seed standard menu items if empty (including all user-requested items)
-- ---------------------------------------------------------------------
insert into public.menu_items (name, price, category)
select name, price, category from (
  values
    ('Ice Americano', 170, 'Beverages - Cold'),
    ('Americano (Hot/Cold)', 150, 'Beverages - Coffee'),
    ('Cappuccino (Hot/Cold)', 180, 'Beverages - Coffee'),
    ('Espresso (Single/Double)', 120, 'Beverages - Coffee'),
    ('Coke', 60, 'Beverages - Cold'),
    ('Sprite', 60, 'Beverages - Cold'),
    ('Fanta', 60, 'Beverages - Cold'),
    ('Fresh Mint Mojito', 150, 'Beverages - Cold'),
    ('Sweet Lassi', 120, 'Beverages - Cold'),
    ('Banana Lassi', 140, 'Beverages - Cold'),
    ('Chilled Beer', 350, 'Beverages - Cold'),
    ('Sekuwa (Chicken/Buff)', 250, 'Food & Snacks'),
    ('Butter Croissant', 120, 'Bakery & Pastries'),
    ('Fresh Muffins', 80, 'Bakery & Pastries'),
    ('Grilled Club Sandwich', 180, 'Food & Snacks'),
    ('Glazed Donuts', 90, 'Bakery & Pastries'),
    ('Patties (Veg / Chicken)', 70, 'Bakery & Pastries'),
    ('Chocochip Cookies', 60, 'Bakery & Pastries'),
    ('Chocolate Brownies', 120, 'Bakery & Pastries'),
    ('Assorted Pastries', 130, 'Bakery & Pastries'),
    ('Extra Joystick (2nd Player)', 50, 'Add-ons')
) as m(name, price, category)
where not exists (select 1 from public.menu_items limit 1);

-- ---------------------------------------------------------------------
-- stations: the actual physical PlayStation stations/booths in the cafe,
-- managed from the dashboard's Stations tab (admin-only setup). Session's
-- station_name is still free text (so a temporary/ad-hoc entry like
-- "Counter" for a food-only order still works), but New Session and Edit
-- both offer these as autocomplete suggestions, which is what lets the
-- availability board reliably match a running session to a station.
-- ---------------------------------------------------------------------
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null default 'PS5',
  rate numeric not null default 300,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for databases created before per-station
-- pricing existed — safe to re-run.
alter table public.stations add column if not exists rate numeric not null default 300;

-- ---------------------------------------------------------------------
-- tables: the physical tables in the waiting room, managed from the
-- dashboard's Waiting List tab (admin-only setup). Assigned to a waiting
-- party so staff can find/allocate them by table, same autocomplete
-- pattern as stations above.
-- ---------------------------------------------------------------------
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.tables add column if not exists active boolean not null default true;

-- ---------------------------------------------------------------------
-- waiting_list: first-come-first-served queue for customers waiting on a
-- free station. They can order food while they wait, and are optionally
-- assigned a waiting-room table; when their turn comes, "Start session"
-- on the dashboard carries their name/phone/food order straight into New
-- Session so staff only need to pick a station.
-- ---------------------------------------------------------------------
create table if not exists public.waiting_list (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  table_name text,
  food_items jsonb not null default '[]'::jsonb,
  food_total numeric not null default 0,
  status text not null default 'Waiting' check (status in ('Waiting', 'Seated', 'Cancelled')),
  notes text,
  staff_id uuid references public.staff(id) on delete set null,
  staff_name text,
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for databases created before tables existed.
alter table public.waiting_list add column if not exists table_name text;
alter table public.waiting_list add column if not exists food_items jsonb not null default '[]'::jsonb;
alter table public.waiting_list add column if not exists food_total numeric not null default 0;
alter table public.waiting_list add column if not exists staff_id uuid references public.staff(id) on delete set null;
alter table public.waiting_list add column if not exists staff_name text;

create index if not exists waiting_list_status_idx on public.waiting_list (status);

-- ---------------------------------------------------------------------
-- Seed the first admin login, only if no staff exist yet (safe to re-run).
-- Username: admin   Password: ChangeMe123!
-- CHANGE THIS PASSWORD IMMEDIATELY after your first login (Staff tab →
-- Admin → Reset password) — it's printed here in plain text in your SQL
-- editor history otherwise.
-- ---------------------------------------------------------------------
do $$
declare
  seed_salt text := encode(gen_random_bytes(16), 'hex');
begin
  if not exists (select 1 from public.staff) then
    insert into public.staff (name, username, password_hash, password_salt, role, active)
    values ('Admin', 'admin', encode(digest(seed_salt || 'ChangeMe123!', 'sha256'), 'hex'), seed_salt, 'admin', true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.menu_items enable row level security;
alter table public.settings enable row level security;
alter table public.staff enable row level security;
alter table public.stations enable row level security;
alter table public.tables enable row level security;
alter table public.waiting_list enable row level security;
alter table public.notices enable row level security;
alter table public.expenses enable row level security;
alter table public.capital_contributions enable row level security;

drop policy if exists "menu_items_all_anon" on public.menu_items;
create policy "menu_items_all_anon" on public.menu_items for all using (true) with check (true);

drop policy if exists "sessions_all_anon" on public.sessions;
create policy "sessions_all_anon" on public.sessions for all using (true) with check (true);

drop policy if exists "settings_all_anon" on public.settings;
create policy "settings_all_anon" on public.settings for all using (true) with check (true);

drop policy if exists "staff_all_anon" on public.staff;
create policy "staff_all_anon" on public.staff for all using (true) with check (true);

drop policy if exists "stations_all_anon" on public.stations;
create policy "stations_all_anon" on public.stations for all using (true) with check (true);

drop policy if exists "tables_all_anon" on public.tables;
create policy "tables_all_anon" on public.tables for all using (true) with check (true);

drop policy if exists "waiting_list_all_anon" on public.waiting_list;
create policy "waiting_list_all_anon" on public.waiting_list for all using (true) with check (true);

drop policy if exists "notices_all_anon" on public.notices;
create policy "notices_all_anon" on public.notices for all using (true) with check (true);

drop policy if exists "expenses_all_anon" on public.expenses;
create policy "expenses_all_anon" on public.expenses for all using (true) with check (true);

drop policy if exists "capital_all_anon" on public.capital_contributions;
create policy "capital_all_anon" on public.capital_contributions for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- Realtime publications
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.sessions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.menu_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.settings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.staff;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.stations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tables;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.waiting_list;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notices;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.expenses;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.capital_contributions;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Role Permissions & PostgREST cache reload
-- ---------------------------------------------------------------------
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- Instruct PostgREST to reload its schema cache immediately
notify pgrst, 'reload schema';



-- =====================================================================
-- TOURNAMENT MANAGEMENT SYSTEM
-- Run this block in Supabase SQL Editor to enable tournaments.
-- =====================================================================

-- tournaments: one row per tournament event
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game text not null default 'EA FC 25',
  description text,
  format text not null default 'knockout' check (format in ('knockout', 'group_stage')),
  status text not null default 'draft'
    check (status in ('draft','registration_open','registration_closed','ongoing','completed','cancelled')),
  max_players integer not null default 16,
  entry_fee numeric not null default 0,
  prize_pool jsonb not null default '[]'::jsonb,
  expenses_amount numeric not null default 0,
  expenses_notes text,
  cash_prizes_paid numeric not null default 0,
  rules text,
  registration_deadline timestamptz,
  start_date timestamptz,
  show_on_homepage boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backwards-compatible alteration for existing tables
alter table public.tournaments add column if not exists expenses_amount numeric not null default 0;
alter table public.tournaments add column if not exists expenses_notes text;
alter table public.tournaments add column if not exists cash_prizes_paid numeric not null default 0;

-- tournament_players: registered participants
create table if not exists public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_name text not null,
  team_name text,
  phone text not null,
  email text,
  gamertag text,
  status text not null default 'registered'
    check (status in ('registered','confirmed','eliminated','winner','runner_up')),
  group_name text,
  seed integer,
  points integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  created_at timestamptz not null default now()
);

-- tournament_matches: schedule + results
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_name text not null,
  round_number integer not null default 1,
  match_number integer not null default 1,
  player1_id uuid references public.tournament_players(id) on delete set null,
  player2_id uuid references public.tournament_players(id) on delete set null,
  player1_score integer,
  player2_score integer,
  winner_id uuid references public.tournament_players(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled','ongoing','completed','bye')),
  scheduled_at timestamptz,
  station_name text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tournament_players_tid on public.tournament_players(tournament_id);
create index if not exists idx_tournament_matches_tid on public.tournament_matches(tournament_id);

alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.tournament_matches enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='tournaments' and policyname='tournaments_all') then
    create policy tournaments_all on public.tournaments for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='tournament_players' and policyname='tplayers_all') then
    create policy tplayers_all on public.tournament_players for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='tournament_matches' and policyname='tmatches_all') then
    create policy tmatches_all on public.tournament_matches for all using (true) with check (true);
  end if;
end $$;

grant all on public.tournaments to anon, authenticated, service_role;
grant all on public.tournament_players to anon, authenticated, service_role;
grant all on public.tournament_matches to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- Native inventory (also available as a standalone migration).
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
