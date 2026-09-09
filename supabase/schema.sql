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
  created_at timestamptz not null default now()
);

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
  payment_method text check (payment_method in ('Cash', 'Online')),
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for databases created before staff/billing
-- columns existed — safe to re-run.
alter table public.sessions add column if not exists staff_id uuid references public.staff(id) on delete set null;
alter table public.sessions add column if not exists staff_name text;
alter table public.sessions add column if not exists payment_method text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_payment_method_check') then
    alter table public.sessions add constraint sessions_payment_method_check check (payment_method in ('Cash', 'Online'));
  end if;
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

insert into public.settings (id, default_rate, cafe_name, opening_hours, whatsapp_number, pan_number, initial_capital)
values (1, 100, 'ChillPill Gaming Cafe', '7:00 AM – 8:00 PM · Every day', '9779765130636', '625001462', 1500000)
on conflict (id) do nothing;

-- Backward-compatible migration for databases created before the CMS columns existed.
alter table public.settings add column if not exists cafe_tagline text not null default 'Console gaming, snacks & good vibes.';
alter table public.settings add column if not exists cafe_location text not null default 'Budhanilkantha, Kathmandu';
alter table public.settings add column if not exists cafe_address text not null default 'Budhanilkantha, Kathmandu, Nepal';
alter table public.settings add column if not exists opening_hours text not null default '7:00 AM – 8:00 PM · Every day';
alter table public.settings add column if not exists whatsapp_number text not null default '9779765130636';
alter table public.settings add column if not exists whatsapp_message text not null default 'Hi! I''d like to book a PlayStation slot at ChillPill Gaming Cafe.';
alter table public.settings add column if not exists pan_number text not null default '625001462';
alter table public.settings add column if not exists initial_capital numeric not null default 1500000;
alter table public.settings add column if not exists google_maps_url text not null default 'https://maps.app.goo.gl/uBQnASzc9W2igYmh6';

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

-- Seed soft and grand opening notice if table is empty
insert into public.notices (title, badge, message, button_text, button_url, popup, active)
select
  'Grand Opening & Soft Opening Celebration!',
  'Upcoming Opening',
  'ChillPill Gaming Cafe is opening soon! 🎮 Join us for our Soft Opening on September 17, and celebrate our Grand Opening on Saturday, September 19. Experience private PS5 & PS4 cabins, top-tier games, specialty coffee, and mouth-watering snacks. Opening daily from 7:00 AM to 8:00 PM!',
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
end $$;
