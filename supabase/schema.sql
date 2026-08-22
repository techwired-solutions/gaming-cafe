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
  opening_hours text not null default '10:00 AM – 11:00 PM · Every day',
  whatsapp_number text not null default '',
  whatsapp_message text not null default 'Hi! I''d like to book a PlayStation slot at ChillPill Gaming Cafe.',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id, default_rate, cafe_name)
values (1, 100, 'ChillPill Gaming Cafe')
on conflict (id) do nothing;

-- Backward-compatible migration for databases created before the CMS columns existed.
alter table public.settings add column if not exists cafe_tagline text not null default 'Console gaming, snacks & good vibes.';
alter table public.settings add column if not exists cafe_location text not null default 'Budhanilkantha, Kathmandu';
alter table public.settings add column if not exists cafe_address text not null default 'Budhanilkantha, Kathmandu, Nepal';
alter table public.settings add column if not exists opening_hours text not null default '10:00 AM – 11:00 PM · Every day';
alter table public.settings add column if not exists whatsapp_number text not null default '';
alter table public.settings add column if not exists whatsapp_message text not null default 'Hi! I''d like to book a PlayStation slot at ChillPill Gaming Cafe.';

-- ---------------------------------------------------------------------
-- stations: the actual physical PlayStation stations/compartments in the
-- cafe, managed from the dashboard's Stations tab (admin-only setup).
-- Session's station_name is still free text (so a temporary/ad-hoc entry
-- like "Counter" for a food-only order still works), but New Session and
-- Edit both offer these as autocomplete suggestions, which is what lets
-- the availability board reliably match a running session to a station.
-- ---------------------------------------------------------------------
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null default 'PS5',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- waiting_list: first-come-first-served queue for customers waiting on a
-- free station. They can order food while they wait; when their turn
-- comes, "Start session" on the dashboard carries their name/phone/food
-- order straight into New Session so staff only need to pick a station.
-- ---------------------------------------------------------------------
create table if not exists public.waiting_list (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  food_items jsonb not null default '[]'::jsonb,
  food_total numeric not null default 0,
  status text not null default 'Waiting' check (status in ('Waiting', 'Seated', 'Cancelled')),
  notes text,
  staff_id uuid references public.staff(id) on delete set null,
  staff_name text,
  created_at timestamptz not null default now()
);

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
--
-- SECURITY NOTE: this project uses only the public "anon" key (no Supabase
-- Auth / login accounts), so the policies below intentionally allow the
-- anon key full access to these tables. Dashboard logins (staff table) are
-- a UI-level deterrent, not a database-level one — anyone who extracts your
-- anon key and URL from the deployed JS could, in theory, read/write these
-- tables (including staff password hashes) directly via the Supabase API.
-- For a small single-location cafe this is a reasonable trade-off, but if
-- you want real protection later, switch to Supabase Auth and change
-- `using (true)` below to `using (auth.uid() is not null)`.
-- ---------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.menu_items enable row level security;
alter table public.settings enable row level security;
alter table public.staff enable row level security;
alter table public.stations enable row level security;
alter table public.waiting_list enable row level security;

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

drop policy if exists "waiting_list_all_anon" on public.waiting_list;
create policy "waiting_list_all_anon" on public.waiting_list for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- Realtime: lets the dashboard update instantly across multiple devices,
-- and lets the public site's menu/content stay in sync without a page
-- refresh. Each ADD TABLE is wrapped in its own exception handler that
-- swallows exactly "already a member of publication" (SQLSTATE 42710,
-- duplicate_object) — this is more reliable than pre-checking
-- pg_publication_tables, which can disagree with Supabase's managed
-- publication in some projects.
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
    alter publication supabase_realtime add table public.waiting_list;
  exception when duplicate_object then null;
  end;
end $$;
