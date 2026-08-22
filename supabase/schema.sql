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
-- sessions: every booking / walk-in / active / completed gaming session.
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Walk-in' check (type in ('Walk-in', 'Booked')),
  station_name text not null,
  customer_name text not null,
  customer_phone text not null,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer not null default 60,
  rate numeric not null default 100,
  food_items jsonb not null default '[]'::jsonb,
  food_total numeric not null default 0,
  amount numeric not null default 0,
  status text not null default 'Active' check (status in ('Booked', 'Active', 'Completed', 'Cancelled')),
  notes text,
  notified_5min boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sessions_status_idx on public.sessions (status);
create index if not exists sessions_end_time_idx on public.sessions (end_time);

-- ---------------------------------------------------------------------
-- settings: single-row table for the shop-wide default hourly rate, etc.
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id integer primary key default 1,
  default_rate numeric not null default 100,
  cafe_name text not null default 'ChillPill Gaming Cafe',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id, default_rate, cafe_name)
values (1, 100, 'ChillPill Gaming Cafe')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- SECURITY NOTE: this project uses only the public "anon" key (no Supabase
-- Auth / login accounts), so the policies below intentionally allow the
-- anon key full access to these tables. The dashboard's password screen is
-- a UI-level deterrent, not a database-level one — anyone with your anon
-- key and API URL (visible in your deployed JS bundle) could call the
-- Supabase API directly. For a small single-location cafe this is a
-- reasonable trade-off, but if you want real protection later, enable
-- Supabase Auth and change `using (true)` below to `using (auth.uid() is not null)`.
-- ---------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.menu_items enable row level security;
alter table public.settings enable row level security;

drop policy if exists "menu_items_all_anon" on public.menu_items;
create policy "menu_items_all_anon" on public.menu_items for all using (true) with check (true);

drop policy if exists "sessions_all_anon" on public.sessions;
create policy "sessions_all_anon" on public.sessions for all using (true) with check (true);

drop policy if exists "settings_all_anon" on public.settings;
create policy "settings_all_anon" on public.settings for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- Realtime: lets the dashboard update instantly across multiple devices,
-- and lets the public site's menu stay in sync without a page refresh.
-- If any of these error with "already a member", that's fine — ignore it.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.menu_items;
alter publication supabase_realtime add table public.settings;
