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


-- Actual daily food partner bills and payments.
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


-- Accounting, cash/bank books and unpaid expense invoices.
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
