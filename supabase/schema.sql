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
-- Seed revised menu items if empty (combines ChillPill, Bro's Burger & Bardali)
-- ---------------------------------------------------------------------
insert into public.menu_items (name, price, category, supplier)
select name, price, category, supplier from (
  values
    ('Americano (Cold)', 140, 'Coffee & Tea', 'chillpill'),
    ('Americano (Hot)', 120, 'Coffee & Tea', 'chillpill'),
    ('Black Tea', 25, 'Coffee & Tea', 'bros_burger'),
    ('Cappuccino', 160, 'Coffee & Tea', 'chillpill'),
    ('Coffee Latte', 160, 'Coffee & Tea', 'chillpill'),
    ('Cold Coffee', 235, 'Coffee & Tea', 'bros_burger'),
    ('Espresso', 120, 'Coffee & Tea', 'chillpill'),
    ('Hot Lemon with Honey', 145, 'Coffee & Tea', 'bros_burger'),
    ('Long Coffee', 130, 'Coffee & Tea', 'chillpill'),
    ('Matka Milk Tea', 60, 'Coffee & Tea', 'bros_burger'),
    ('Milk Tea', 40, 'Coffee & Tea', 'bros_burger'),
    ('Oulci Coffee', 140, 'Coffee & Tea', 'chillpill'),
    ('7up', 95, 'Cold Drinks & Refreshers', 'bardali'),
    ('Banana Lassi', 225, 'Cold Drinks & Refreshers', 'bros_burger'),
    ('Coke', 60, 'Cold Drinks & Refreshers', 'chillpill'),
    ('Coke Zero', 60, 'Cold Drinks & Refreshers', 'chillpill'),
    ('Extreme', 160, 'Cold Drinks & Refreshers', 'chillpill'),
    ('Fanta', 60, 'Cold Drinks & Refreshers', 'chillpill'),
    ('Fresh Lime Soda', 145, 'Cold Drinks & Refreshers', 'bardali'),
    ('Lemon Sprite', 135, 'Cold Drinks & Refreshers', 'bros_burger'),
    ('Masala Pepsi', 145, 'Cold Drinks & Refreshers', 'bardali'),
    ('Mirinda', 95, 'Cold Drinks & Refreshers', 'bardali'),
    ('Mountain Dew', 95, 'Cold Drinks & Refreshers', 'bardali'),
    ('Pepsi', 95, 'Cold Drinks & Refreshers', 'bardali'),
    ('Plain Lime Soda', 95, 'Cold Drinks & Refreshers', 'bardali'),
    ('Real Juice (Bottle)', 600, 'Cold Drinks & Refreshers', 'bardali'),
    ('Real Juice (Glass)', 335, 'Cold Drinks & Refreshers', 'bardali'),
    ('Sprite', 60, 'Cold Drinks & Refreshers', 'chillpill'),
    ('Sweet Lassi', 145, 'Cold Drinks & Refreshers', 'bros_burger'),
    ('Water', 30, 'Cold Drinks & Refreshers', 'chillpill'),
    ('Aloo Patty Burger', 300, 'Burgers & Wraps', 'bros_burger'),
    ('Chicken Wrap', 195, 'Burgers & Wraps', 'bros_burger'),
    ('Classic Chicken Burger', 355, 'Burgers & Wraps', 'bros_burger'),
    ('Crispy Chicken Burger', 485, 'Burgers & Wraps', 'bros_burger'),
    ('Double Decker Buff Burger', 675, 'Burgers & Wraps', 'bros_burger'),
    ('Double Decker Chicken Burger', 675, 'Burgers & Wraps', 'bros_burger'),
    ('Grilled Chicken Burger', 425, 'Burgers & Wraps', 'bros_burger'),
    ('Smashed Cheese Burger', 435, 'Burgers & Wraps', 'bros_burger'),
    ('Thakali Burger', 395, 'Burgers & Wraps', 'bros_burger'),
    ('Veg Wrap', 185, 'Burgers & Wraps', 'bros_burger'),
    ('Veggie Burger', 325, 'Burgers & Wraps', 'bros_burger'),
    ('Chicken Chaila Pizza', 715, 'Pizza', 'bardali'),
    ('Margherita Pizza', 595, 'Pizza', 'bardali'),
    ('Smoke Chicken Pizza', 750, 'Pizza', 'bardali'),
    ('Belgian Fries', 225, 'Fries & Snacks', 'bros_burger'),
    ('Buffalo Wings (3 pcs)', 365, 'Fries & Snacks', 'bros_burger'),
    ('Cheese Fries', 265, 'Fries & Snacks', 'bros_burger'),
    ('Chicken 65', 285, 'Fries & Snacks', 'bros_burger'),
    ('Chicken Chilly', 450, 'Fries & Snacks', 'bardali'),
    ('Chicken Lolly', 420, 'Fries & Snacks', 'bardali'),
    ('Chicken Nuggets', 300, 'Fries & Snacks', 'bardali'),
    ('Chicken Pakoda', 320, 'Fries & Snacks', 'bros_burger'),
    ('Chicken Ring', 265, 'Fries & Snacks', 'bros_burger'),
    ('Chips Chilly', 255, 'Fries & Snacks', 'bros_burger'),
    ('Crunchy Fried Chicken (4 pcs)', 475, 'Fries & Snacks', 'bros_burger'),
    ('Crunchy Fried Chicken (6 pcs)', 800, 'Fries & Snacks', 'bros_burger'),
    ('French Fries', 165, 'Fries & Snacks', 'bros_burger'),
    ('Kaju Chicken', 475, 'Fries & Snacks', 'bardali'),
    ('Loaded Fries', 365, 'Fries & Snacks', 'bros_burger'),
    ('Masala Fries', 295, 'Fries & Snacks', 'bardali'),
    ('Mustang Aloo', 180, 'Fries & Snacks', 'bros_burger'),
    ('Onion Ring', 160, 'Fries & Snacks', 'bros_burger'),
    ('Paneer Chilly', 450, 'Fries & Snacks', 'bardali'),
    ('Pangra Fry', 450, 'Fries & Snacks', 'bardali'),
    ('Parmesan Chicken', 455, 'Fries & Snacks', 'bros_burger'),
    ('Popcorn Chicken', 300, 'Fries & Snacks', 'bros_burger'),
    ('Pork Chilly', 475, 'Fries & Snacks', 'bardali'),
    ('Sausage Chilly', 255, 'Fries & Snacks', 'bros_burger'),
    ('Spicy Wings (6 pcs)', 395, 'Fries & Snacks', 'bros_burger'),
    ('Timur Chicken', 295, 'Fries & Snacks', 'bros_burger'),
    ('Bhatmas / Peanuts', 270, 'Sadheko & Choila', 'bardali'),
    ('Chatpate', 125, 'Sadheko & Choila', 'bros_burger'),
    ('Chau Chau Sadheko', 145, 'Sadheko & Choila', 'bros_burger'),
    ('Chicken Chau Chau Sadheko', 250, 'Sadheko & Choila', 'bros_burger'),
    ('Chicken Sadheko', 300, 'Sadheko & Choila', 'bros_burger'),
    ('Corn Sadheko', 295, 'Sadheko & Choila', 'bardali'),
    ('Hariyo Bhatmas', 295, 'Sadheko & Choila', 'bardali'),
    ('Machha Sadheko', 510, 'Sadheko & Choila', 'bardali'),
    ('Mushroom Choila', 415, 'Sadheko & Choila', 'bardali'),
    ('Mushroom Sadheko', 390, 'Sadheko & Choila', 'bardali'),
    ('Buff Chilly Momo', 300, 'Momo', 'bardali'),
    ('Buff Fry Momo', 270, 'Momo', 'bardali'),
    ('Buff Kothey Momo', 270, 'Momo', 'bardali'),
    ('Buff Steam Momo', 235, 'Momo', 'bardali'),
    ('Chicken Chilly Momo', 295, 'Momo', 'bros_burger'),
    ('Chicken Choila Momo', 290, 'Momo', 'bros_burger'),
    ('Chicken Crispy Momo', 305, 'Momo', 'bros_burger'),
    ('Chicken Jhol Momo', 205, 'Momo', 'bros_burger'),
    ('Chicken Kothey Momo', 270, 'Momo', 'bardali'),
    ('Chicken Soup Momo', 255, 'Momo', 'bros_burger'),
    ('Chicken Steam Momo', 195, 'Momo', 'bros_burger'),
    ('Veg Chilly Momo', 270, 'Momo', 'bardali'),
    ('Veg Fry Momo', 240, 'Momo', 'bardali'),
    ('Veg Kothey Momo', 240, 'Momo', 'bardali'),
    ('Veg Steam Momo', 210, 'Momo', 'bardali'),
    ('Buff Chowmein', 245, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Buff Fried Rice', 250, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Buff Keema Noodles', 265, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Buff Thukpa', 235, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Chicken Biryani', 570, 'Noodles, Thukpa & Rice', 'bardali'),
    ('Chicken Chowmein', 255, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Chicken Current Noodles', 185, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Chicken Fried Rice', 265, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Chicken Keema Noodles', 245, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Chicken Thukpa', 255, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Dragon Chicken with Rice', 325, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Egg Current Noodles', 155, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Egg Fried Rice', 195, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Mix Chowmein', 390, 'Noodles, Thukpa & Rice', 'bardali'),
    ('Mixed Fried Rice', 295, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Veg Biryani', 510, 'Noodles, Thukpa & Rice', 'bardali'),
    ('Veg Chowmein', 185, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Veg Current Noodles', 125, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Veg Fried Rice', 170, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Veg Thukpa', 195, 'Noodles, Thukpa & Rice', 'bros_burger'),
    ('Cheese Fries & Coke', 345, 'Combos', 'bros_burger'),
    ('Chicken Wrap, Classic Chicken Burger, French Fries & Coke', 775, 'Combos', 'bros_burger'),
    ('Choila Momo, Spicy Wings & 2 Cokes', 845, 'Combos', 'bros_burger'),
    ('Veg Wrap, Veggie Burger, French Fries & Coke', 735, 'Combos', 'bros_burger'),
    ('Bardali Platter', 1435, 'Thali & Platters', 'bardali'),
    ('Chicken Thali Set', 540, 'Thali & Platters', 'bardali'),
    ('Local Chicken Thali Set', 660, 'Thali & Platters', 'bardali'),
    ('Mutton Thali Set', 660, 'Thali & Platters', 'bardali'),
    ('Paneer Thali Set', 540, 'Thali & Platters', 'bardali'),
    ('Sekuwa Platter (Mutton / Chicken / Pork)', 1795, 'Thali & Platters', 'bardali'),
    ('Veg Thali Set', 420, 'Thali & Platters', 'bardali'),
    ('Chicken Sekuwa Jhaneko', 520, 'Sekuwa', 'bardali'),
    ('Chicken Sekuwa With Bone (250g)', 500, 'Sekuwa', 'bardali'),
    ('Chicken Sekuwa With Bone (Full)', 1800, 'Sekuwa', 'bardali'),
    ('Chicken Sekuwa With Bone (Half)', 1020, 'Sekuwa', 'bardali'),
    ('Chicken Sekuwa With Bone (Set)', 390, 'Sekuwa', 'bardali'),
    ('Mutton Sekuwa (250g)', 1020, 'Sekuwa', 'bardali'),
    ('Mutton Sekuwa (Full)', 3600, 'Sekuwa', 'bardali'),
    ('Mutton Sekuwa (Half)', 1920, 'Sekuwa', 'bardali'),
    ('Mutton Sekuwa (Set)', 625, 'Sekuwa', 'bardali'),
    ('Mutton Sekuwa Jhaneko', 660, 'Sekuwa', 'bardali'),
    ('Paneer Sekuwa (250g)', 540, 'Sekuwa', 'bardali'),
    ('Paneer Sekuwa (Full)', 1800, 'Sekuwa', 'bardali'),
    ('Paneer Sekuwa (Half)', 1020, 'Sekuwa', 'bardali'),
    ('Paneer Sekuwa (Set)', 450, 'Sekuwa', 'bardali'),
    ('Pangra Sekuwa (250g)', 540, 'Sekuwa', 'bardali'),
    ('Pangra Sekuwa (Full)', 1920, 'Sekuwa', 'bardali'),
    ('Pangra Sekuwa (Half)', 1020, 'Sekuwa', 'bardali'),
    ('Pangra Sekuwa (Set)', 450, 'Sekuwa', 'bardali'),
    ('Pork Sekuwa (250g)', 510, 'Sekuwa', 'bardali'),
    ('Pork Sekuwa (Full)', 1920, 'Sekuwa', 'bardali'),
    ('Pork Sekuwa (Half)', 1050, 'Sekuwa', 'bardali'),
    ('Pork Sekuwa (Set)', 415, 'Sekuwa', 'bardali'),
    ('Wings Sekuwa (Full)', 1920, 'Sekuwa', 'bardali'),
    ('Wings Sekuwa (Half)', 1020, 'Sekuwa', 'bardali'),
    ('Wings Sekuwa (Set)', 510, 'Sekuwa', 'bardali'),
    ('Aalu Poleko', 210, 'Nepali Specialties', 'bardali'),
    ('Bhuja Set', 90, 'Nepali Specialties', 'bardali'),
    ('Bhutan', 420, 'Nepali Specialties', 'bardali'),
    ('Butwal Saag Sukuti', 500, 'Nepali Specialties', 'bardali'),
    ('Chicken Mole Poleko', 540, 'Nepali Specialties', 'bardali'),
    ('Dharane Sukuti', 540, 'Nepali Specialties', 'bardali'),
    ('Hyakula (Damaka / Poleko / Timmure)', 595, 'Nepali Specialties', 'bardali'),
    ('Janakpure Tawa Machha', 570, 'Nepali Specialties', 'bardali'),
    ('Khasiko Masu Chiura', 595, 'Nepali Specialties', 'bardali'),
    ('Lasun Poleko', 210, 'Nepali Specialties', 'bardali'),
    ('Local Vale Masu Chiura', 595, 'Nepali Specialties', 'bardali'),
    ('Pork Mole Poleko', 540, 'Nepali Specialties', 'bardali'),
    ('Rajkhani Poleko', 535, 'Nepali Specialties', 'bardali'),
    ('Sausage Fry / Poleko', 475, 'Nepali Specialties', 'bardali'),
    ('Tauko (Sadheko / Fry / Boil)', 475, 'Nepali Specialties', 'bardali'),
    ('Timmure Aalu', 295, 'Nepali Specialties', 'bardali'),
    ('Timmure Pork Slice', 475, 'Nepali Specialties', 'bardali'),
    ('Timmure Wings', 475, 'Nepali Specialties', 'bardali'),
    ('Twakka Aaloo', 295, 'Nepali Specialties', 'bardali'),
    ('Whole Grilled Fish', 900, 'Nepali Specialties', 'bardali'),
    ('Chicken Salad', 395, 'Salads & Soups', 'bros_burger'),
    ('Chicken Soup', 270, 'Salads & Soups', 'bardali'),
    ('Green Salad', 210, 'Salads & Soups', 'bardali'),
    ('Hot and Sour Soup (Non-Veg)', 330, 'Salads & Soups', 'bardali'),
    ('Hot and Sour Soup (Veg)', 270, 'Salads & Soups', 'bardali'),
    ('Mushroom Soup', 210, 'Salads & Soups', 'bardali'),
    ('Seasonal Fruits Salad', 450, 'Salads & Soups', 'bardali'),
    ('Veg Boil', 330, 'Salads & Soups', 'bardali'),
    ('Barasinghee Hazy IPA', 730, 'Beer & Cider', 'bardali'),
    ('Barasinghee Pale Ale', 720, 'Beer & Cider', 'bardali'),
    ('Barasinghee Pilsner', 660, 'Beer & Cider', 'bardali'),
    ('Barasinghee Pilsner (Tower)', 2620, 'Beer & Cider', 'bardali'),
    ('Carlsberg', 745, 'Beer & Cider', 'bardali'),
    ('Gorkha Craft', 635, 'Beer & Cider', 'bardali'),
    ('Gorkha Pilsner', 625, 'Beer & Cider', 'bardali'),
    ('Gorkha Pilsner (Tower)', 2495, 'Beer & Cider', 'bardali'),
    ('Gorkha Strong', 600, 'Beer & Cider', 'bardali'),
    ('Ruslan Cooler', 325, 'Beer & Cider', 'bardali'),
    ('Sherpa Draught IPA (1.5 L Pitcher)', 2160, 'Beer & Cider', 'bardali'),
    ('Sherpa Draught IPA (500 ml)', 720, 'Beer & Cider', 'bardali'),
    ('Sherpa Draught Kolsh (1.5 L Pitcher)', 1980, 'Beer & Cider', 'bardali'),
    ('Sherpa Draught Kolsh (500 ml)', 660, 'Beer & Cider', 'bardali'),
    ('Sherpa Draught Red (1.5 L Pitcher)', 1980, 'Beer & Cider', 'bardali'),
    ('Sherpa Draught Red (500 ml)', 660, 'Beer & Cider', 'bardali'),
    ('Tuborg', 660, 'Beer & Cider', 'bardali'),
    ('Tuborg (Tower)', 2640, 'Beer & Cider', 'bardali'),
    ('Jacob''s Creek Merlot Shiraz', 3360, 'Wine', 'bardali'),
    ('Jacob''s Creek Moscato', 3360, 'Wine', 'bardali'),
    ('Robertson Sweet Red', 2640, 'Wine', 'bardali'),
    ('Robertson Sweet White', 2640, 'Wine', 'bardali'),
    ('8848 Vodka (60 ml)', 395, 'Spirits', 'bardali'),
    ('8848 Vodka (Full)', 3520, 'Spirits', 'bardali'),
    ('8848 Vodka (Half)', 1765, 'Spirits', 'bardali'),
    ('8848 Vodka (Quarter)', 880, 'Spirits', 'bardali'),
    ('Absolut Vodka (60 ml)', 720, 'Spirits', 'bardali'),
    ('Absolut Vodka (Full)', 10255, 'Spirits', 'bardali'),
    ('Absolut Vodka (Half)', 5130, 'Spirits', 'bardali'),
    ('Absolut Vodka (Quarter)', 2570, 'Spirits', 'bardali'),
    ('Beefeater Gin (60 ml)', 755, 'Spirits', 'bardali'),
    ('Beefeater Gin (Full)', 10510, 'Spirits', 'bardali'),
    ('Beefeater Gin (Half)', 5255, 'Spirits', 'bardali'),
    ('Beefeater Gin (Quarter)', 2630, 'Spirits', 'bardali'),
    ('Chivas (60 ml)', 1030, 'Spirits', 'bardali'),
    ('Chivas (Full)', 14330, 'Spirits', 'bardali'),
    ('Chivas (Half)', 7165, 'Spirits', 'bardali'),
    ('Chivas (Quarter)', 3580, 'Spirits', 'bardali'),
    ('Gurkhas N Guns Whisky (60 ml)', 470, 'Spirits', 'bardali'),
    ('Gurkhas N Guns Whisky (Full)', 4680, 'Spirits', 'bardali'),
    ('Gurkhas N Guns Whisky (Half)', 2340, 'Spirits', 'bardali'),
    ('Gurkhas N Guns Whisky (Quarter)', 1170, 'Spirits', 'bardali'),
    ('Himalayan Reserve Whisky (60 ml)', 540, 'Spirits', 'bardali'),
    ('Himalayan Reserve Whisky (Full)', 5400, 'Spirits', 'bardali'),
    ('Himalayan Reserve Whisky (Half)', 2700, 'Spirits', 'bardali'),
    ('Himalayan Reserve Whisky (Quarter)', 1350, 'Spirits', 'bardali'),
    ('Jack Daniels (60 ml)', 910, 'Spirits', 'bardali'),
    ('Jack Daniels (Full)', 12670, 'Spirits', 'bardali'),
    ('Jack Daniels (Half)', 6335, 'Spirits', 'bardali'),
    ('Jack Daniels (Quarter)', 3170, 'Spirits', 'bardali'),
    ('Jameson (60 ml)', 850, 'Spirits', 'bardali'),
    ('Jameson (Full)', 11880, 'Spirits', 'bardali'),
    ('Jameson (Half)', 5940, 'Spirits', 'bardali'),
    ('Jameson (Quarter)', 2970, 'Spirits', 'bardali'),
    ('Junge Kaji Rum (60 ml)', 300, 'Spirits', 'bardali'),
    ('Junge Kaji Rum (Full)', 3025, 'Spirits', 'bardali'),
    ('Junge Kaji Rum (Half)', 1510, 'Spirits', 'bardali'),
    ('Junge Kaji Rum (Quarter)', 755, 'Spirits', 'bardali'),
    ('JW Black Label (12 yrs.) (60 ml)', 1030, 'Spirits', 'bardali'),
    ('JW Black Label (12 yrs.) (Full)', 14330, 'Spirits', 'bardali'),
    ('JW Black Label (12 yrs.) (Half)', 7165, 'Spirits', 'bardali'),
    ('JW Black Label (12 yrs.) (Quarter)', 3580, 'Spirits', 'bardali'),
    ('JW Double Black (60 ml)', 1235, 'Spirits', 'bardali'),
    ('JW Double Black (Full)', 17135, 'Spirits', 'bardali'),
    ('JW Double Black (Half)', 8570, 'Spirits', 'bardali'),
    ('JW Double Black (Quarter)', 4285, 'Spirits', 'bardali'),
    ('Kalapatthar Whisky (60 ml)', 445, 'Spirits', 'bardali'),
    ('Kalapatthar Whisky (Full)', 4405, 'Spirits', 'bardali'),
    ('Kalapatthar Whisky (Half)', 2200, 'Spirits', 'bardali'),
    ('Kalapatthar Whisky (Quarter)', 1105, 'Spirits', 'bardali'),
    ('Khukuri Rum (60 ml)', 330, 'Spirits', 'bardali'),
    ('Khukuri Rum (Quarter)', 830, 'Spirits', 'bardali'),
    ('Nude Vodka (60 ml)', 340, 'Spirits', 'bardali'),
    ('Nude Vodka (Full)', 3420, 'Spirits', 'bardali'),
    ('Nude Vodka (Half)', 1710, 'Spirits', 'bardali'),
    ('Nude Vodka (Quarter)', 860, 'Spirits', 'bardali'),
    ('Old Durbar Whisky (60 ml)', 455, 'Spirits', 'bardali'),
    ('Old Durbar Whisky (Full)', 4530, 'Spirits', 'bardali'),
    ('Old Durbar Whisky (Half)', 2270, 'Spirits', 'bardali'),
    ('Old Durbar Whisky (Quarter)', 1135, 'Spirits', 'bardali'),
    ('Olmeca Tequila (1 shot)', 630, 'Spirits', 'bardali'),
    ('Olmeca Tequila (Bottle)', 10200, 'Spirits', 'bardali'),
    ('Ruslan Vodka (60 ml)', 350, 'Spirits', 'bardali'),
    ('Ruslan Vodka (Full)', 3455, 'Spirits', 'bardali'),
    ('Ruslan Vodka (Half)', 1730, 'Spirits', 'bardali'),
    ('Ruslan Vodka (Quarter)', 865, 'Spirits', 'bardali'),
    ('Setobagh Vodka (60 ml)', 330, 'Spirits', 'bardali'),
    ('Setobagh Vodka (Full)', 3300, 'Spirits', 'bardali'),
    ('Setobagh Vodka (Half)', 1650, 'Spirits', 'bardali'),
    ('Setobagh Vodka (Quarter)', 830, 'Spirits', 'bardali'),
    ('The Glenlivet (12 yrs.) (60 ml)', 1535, 'Spirits', 'bardali'),
    ('The Glenlivet (12 yrs.) (Full)', 21360, 'Spirits', 'bardali'),
    ('The Glenlivet (12 yrs.) (Half)', 10680, 'Spirits', 'bardali'),
    ('The Glenlivet (12 yrs.) (Quarter)', 5340, 'Spirits', 'bardali'),
    ('Yeti Vodka (60 ml)', 340, 'Spirits', 'bardali'),
    ('Yeti Vodka (Full)', 3395, 'Spirits', 'bardali'),
    ('Yeti Vodka (Half)', 1700, 'Spirits', 'bardali'),
    ('Yeti Vodka (Quarter)', 850, 'Spirits', 'bardali'),
    ('Cloud Hookah (Apple / Paan Ras / Mint / Blueberry)', 660, 'Hookah', 'bardali'),
    ('Hookah Extra Coil', 120, 'Hookah', 'bardali'),
    ('Premium Flavours Hookah (Ladykiller / Ice Mango / Love 66)', 900, 'Hookah', 'bardali')
) as m(name, price, category, supplier)
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
   insert into public.expenses(title,category,amount,payment_source,type,expense_date,date,paid_by,created_by,notes)
   values(b.supplier_key||' food bill '||b.business_date,'Partner Payout',v_amount,'cafe_revenue','ongoing',
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

begin;
-- Native ChillPill loyalty. Whole hours per visit; overlapping stations count once.
create table if not exists public.loyalty_visits (
 session_id uuid primary key references public.sessions(id) on delete cascade,
 phone text not null, customer_name text not null, played_seconds integer not null,
 stamps integer not null check(stamps>=0), historical boolean not null default false,
 visited_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.loyalty_rewards (
 id uuid primary key default gen_random_uuid(),session_id uuid unique references public.sessions(id) on delete set null,
 phone text not null,station_name text not null,discount numeric(12,2) not null check(discount>0),
 staff_name text not null,created_at timestamptz not null default now(),voided_at timestamptz,checkout_payload jsonb
);
create index if not exists loyalty_visits_phone on public.loyalty_visits(phone);
create index if not exists loyalty_rewards_phone on public.loyalty_rewards(phone) where voided_at is null;
alter table public.sessions add column if not exists loyalty_pauses jsonb not null default '[]';
alter table public.sessions add column if not exists loyalty_completed_at timestamptz;
alter table public.sessions add column if not exists loyalty_historical boolean not null default false;
alter table public.sessions add column if not exists loyalty_discount numeric(12,2) not null default 0;
create or replace function public.loyalty_phone(p text) returns text language sql immutable as $$
 select case when length(d)=13 and left(d,3)='977' then substr(d,4) when length(d) between 7 and 15 then d else '' end
 from (select regexp_replace(regexp_replace(coalesce(p,''),'^00',''),'[^0-9]','','g') d) q
$$;
create or replace function public.loyalty_time(p text,base timestamptz) returns timestamptz language plpgsql stable as $$
begin
 if nullif(p,'') is null then return null;end if;
 if p ~ '^\d{2}:\d{2}(:\d{2})?$' then return (((base at time zone 'Asia/Kathmandu')::date+p::time) at time zone 'Asia/Kathmandu');end if;
 return p::timestamptz;
exception when others then return null;end $$;
create or replace function public.loyalty_slots(r jsonb) returns jsonb language plpgsql stable as $$
declare slots jsonb:='[]'; e jsonb; n text; s timestamptz; f timestamptz; base timestamptz:=nullif(r->>'start_time','')::timestamptz;
begin
 if coalesce((r->>'duration_minutes')::numeric,0)=0 and coalesce(r->>'notes','') like '%[Food Only Sale]%' then return slots;end if;
 for n in select trim(x) from regexp_split_to_table(coalesce(r->>'station_name',''),'[,+&/]') x where trim(x)<>'' loop
  slots:=slots||jsonb_build_array(jsonb_build_object('name',n,'bill',jsonb_array_length(slots)=0,'start',base,'end',coalesce(nullif(r->>'end_time','')::timestamptz,base+make_interval(mins=>coalesce((r->>'duration_minutes')::int,0))),'minutes',r->'duration_minutes','rate',r->'rate'));
 end loop;
 for e in select * from jsonb_array_elements(coalesce(r->'extra_stations','[]')) loop
  n:=trim(coalesce(e->>'station',e->>'station_name',''));if n='' or exists(select 1 from jsonb_array_elements(slots) x where lower(x->>'name')=lower(n)) then continue;end if;
  s:=coalesce(public.loyalty_time(e->>'start_time',base),base);f:=public.loyalty_time(e->>'end_time',s);
  if f<s and coalesce(e->>'end_time','') ~ '^\d{2}:\d{2}' then f:=f+interval '1 day';end if;
  slots:=slots||jsonb_build_array(jsonb_build_object('name',n,'bill',true,'start',s,'end',coalesce(f,s+make_interval(mins=>coalesce((e->>'duration_minutes')::int,0))),'minutes',e->'duration_minutes','rate',e->'rate'));
 end loop;return slots;
end $$;
create or replace function public.loyalty_pause_at(r jsonb,n text) returns timestamptz language plpgsql stable as $$
declare m text[]; e jsonb;
begin
 for m in select regexp_matches(coalesce(r->>'notes',''),'\[Station Paused:\s*([^|\]]+)\|\s*At:\s*([^|\]]+)','gi') loop
  if lower(trim(m[1]))=lower(n) then return public.loyalty_time(trim(m[2]),null);end if;
 end loop;
 for e in select * from jsonb_array_elements(coalesce(r->'extra_stations','[]')) loop
  if lower(coalesce(e->>'station',e->>'station_name',''))=lower(n) and e->>'is_paused'='true' then return public.loyalty_time(e->>'paused_at',null);end if;
 end loop;
 m:=regexp_match(coalesce(r->>'notes',''),'\[Session:\s*Paused\s*\|\s*At:\s*([^|\]]+)','i');
 if m is not null then return public.loyalty_time(trim(m[1]),null);end if;
 return null;
end $$;
create or replace function public.loyalty_play_ranges(r jsonb,cutoff timestamptz,p_name text default null) returns tstzmultirange language plpgsql stable as $$
declare total tstzmultirange:='{}'; span tstzmultirange; slot jsonb; p jsonb; m text[]; s timestamptz; f timestamptz; stop timestamptz; known numeric; excess numeric;
begin
 for slot in select * from jsonb_array_elements(public.loyalty_slots(r)) loop
  if p_name is not null and lower(slot->>'name')<>lower(p_name) then continue;end if;
  s:=(slot->>'start')::timestamptz;f:=least((slot->>'end')::timestamptz,cutoff);if s is null or f is null or f<=s then continue;end if;
  for m in select regexp_matches(coalesce(r->>'notes',''),'\[Station Completed:\s*([^|\]]+)\|\s*At:\s*([^|\]]+)','gi') loop
   if lower(trim(m[1]))=lower(slot->>'name') then f:=least(f,public.loyalty_time(trim(m[2]),s));end if;
  end loop;
  stop:=public.loyalty_pause_at(r,slot->>'name');if stop is not null then f:=least(f,stop);end if;
  if f<=s then continue;end if;
  span:=tstzmultirange(tstzrange(s,f,'[)'));known:=0;
  for p in select * from jsonb_array_elements(coalesce(r->'loyalty_pauses','[]')) loop
   if lower(p->>'station')=lower(slot->>'name') and (p->>'to')::timestamptz>(p->>'from')::timestamptz then
    span:=span-tstzmultirange(tstzrange((p->>'from')::timestamptz,(p->>'to')::timestamptz,'[)'));
    known:=known+extract(epoch from (p->>'to')::timestamptz-(p->>'from')::timestamptz);
   end if;
  end loop;
  -- Old resumes extended end_time but did not retain pause intervals. Keep the recorded
  -- booked duration as a conservative estimate rather than count the extension as play.
  excess:=greatest(0,extract(epoch from (slot->>'end')::timestamptz-s)-coalesce((slot->>'minutes')::numeric,0)*60-known);
  if excess>0 and coalesce((r->>'overtime_amount')::numeric,0)=0 then span:=span*tstzmultirange(tstzrange(s,least(f,(slot->>'end')::timestamptz-make_interval(secs=>excess::double precision)),'[)'));end if;
  total:=total+span;
 end loop;return total;
end $$;
create or replace function public.loyalty_seconds(r jsonb,cutoff timestamptz) returns integer language sql stable as $$
 select coalesce(floor(sum(extract(epoch from upper(x)-lower(x)))),0)::integer from unnest(public.loyalty_play_ranges(r,cutoff)) x
$$;
create or replace function public.loyalty_capture() returns trigger language plpgsql security definer set search_path=public as $$
declare slot jsonb; at_pause timestamptz; stop timestamptz; oldphone text; phone text; secs integer;
begin
 if TG_OP='DELETE' then
  perform pg_advisory_xact_lock(hashtextextended('loyalty:'||public.loyalty_phone(old.customer_phone),0));
  update public.loyalty_rewards set voided_at=coalesce(voided_at,now()) where session_id=old.id;return old;
 end if;
 phone:=public.loyalty_phone(new.customer_phone);
 if new.loyalty_discount<>0 and not exists(select 1 from public.loyalty_rewards where session_id=new.id and discount=new.loyalty_discount and voided_at is null) then
  if new.status='Cancelled' then new.loyalty_discount:=0;else raise exception 'Loyalty credits must be redeemed through checkout';end if;
 end if;
 if TG_OP='UPDATE' then
  oldphone:=public.loyalty_phone(old.customer_phone);
  if new.status='Cancelled' then new.loyalty_discount:=0;end if;
  -- Lock both identities in deterministic order when correcting a customer's phone.
  perform pg_advisory_xact_lock(hashtextextended('loyalty:'||least(phone,oldphone),0));
  if oldphone<>phone then perform pg_advisory_xact_lock(hashtextextended('loyalty:'||greatest(phone,oldphone),0));end if;
  if old.loyalty_discount>0 and new.status<>'Cancelled' and new.loyalty_discount<>old.loyalty_discount then raise exception 'A recorded loyalty credit cannot be edited';end if;
  if oldphone<>phone and exists(select 1 from public.loyalty_rewards where session_id=old.id and voided_at is null) then raise exception 'Void the loyalty reward before changing this customer phone';end if;
  new.loyalty_pauses:=old.loyalty_pauses;
  for slot in select * from jsonb_array_elements(public.loyalty_slots(to_jsonb(old))) loop
   at_pause:=public.loyalty_pause_at(to_jsonb(old),slot->>'name');
   if old.status='Active' and at_pause is not null and (public.loyalty_pause_at(to_jsonb(new),slot->>'name') is null or new.status<>'Active') then
    new.loyalty_pauses:=new.loyalty_pauses||jsonb_build_array(jsonb_build_object('station',slot->>'name','from',at_pause,'to',greatest(at_pause,clock_timestamp())));
   end if;
  end loop;
  if old.status='Completed' and new.status='Active' and exists(select 1 from public.loyalty_rewards where session_id=old.id and voided_at is null) then raise exception 'A redeemed visit cannot be reopened; correct or cancel it first';end if;
  if old.status='Completed' and new.status='Completed' then new.loyalty_completed_at:=old.loyalty_completed_at;
  elsif new.status='Completed' then new.loyalty_completed_at:=clock_timestamp();else new.loyalty_completed_at:=null;end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('loyalty:'||phone,0));
  new.loyalty_historical:=new.status='Completed';
  new.loyalty_completed_at:=case when new.status='Completed' then clock_timestamp() else null end;
 end if;
 if new.status='Cancelled' then update public.loyalty_rewards set voided_at=coalesce(voided_at,now()) where session_id=new.id;end if;
 return new;
end $$;
create or replace function public.loyalty_accrue() returns trigger language plpgsql security definer set search_path=public as $$
declare secs integer;phone text:=public.loyalty_phone(new.customer_phone);
begin
 if new.status='Completed' and phone<>'' and jsonb_array_length(public.loyalty_slots(to_jsonb(new)))>0 and coalesce(new.notes,'') not ilike '%[Payment: Waived%' and coalesce(new.notes,'') not ilike '%[Internal Sale]%' then
  secs:=public.loyalty_seconds(to_jsonb(new),coalesce(new.loyalty_completed_at,now()));
  insert into public.loyalty_visits(session_id,phone,customer_name,played_seconds,stamps,historical,visited_at)
  values(new.id,phone,new.customer_name,secs,floor(secs/3600.0)::int,new.loyalty_historical,new.start_time)
  on conflict(session_id) do update set phone=excluded.phone,customer_name=excluded.customer_name,played_seconds=excluded.played_seconds,stamps=excluded.stamps,historical=excluded.historical,visited_at=excluded.visited_at,updated_at=now();
 else delete from public.loyalty_visits where session_id=new.id;end if;return new;
end $$;
drop trigger if exists loyalty_capture on public.sessions;
create trigger loyalty_capture before insert or update or delete on public.sessions for each row execute function public.loyalty_capture();
drop trigger if exists loyalty_accrue on public.sessions;
create trigger loyalty_accrue after insert or update on public.sessions for each row execute function public.loyalty_accrue();
create or replace function public.loyalty_balance(p_phone text) returns jsonb language sql stable security definer set search_path=public as $$
 with s as(select coalesce(sum(stamps),0)::int stamps,coalesce(sum(played_seconds),0)::bigint seconds from public.loyalty_visits where phone=public.loyalty_phone(p_phone)),r as(select count(*)::int redeemed from public.loyalty_rewards where phone=public.loyalty_phone(p_phone) and voided_at is null)
 select jsonb_build_object('stamps',stamps,'played_seconds',seconds,'redeemed',redeemed,'available',greatest(0,floor(stamps/10.0)::int-redeemed),'progress',greatest(0,stamps-redeemed*10)%10,'deficit',greatest(0,redeemed*10-stamps)) from s,r
$$;
create or replace function public.loyalty_quote(p_session_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.sessions;slot jsonb;seconds numeric;choices jsonb:='[]';credit numeric;
begin
 select * into r from public.sessions where id=p_session_id;if not found then raise exception 'Session not found';end if;
 for slot in select * from jsonb_array_elements(public.loyalty_slots(to_jsonb(r))) loop
  select coalesce(sum(extract(epoch from upper(x)-lower(x))),0) into seconds from unnest(public.loyalty_play_ranges(to_jsonb(r),now(),slot->>'name')) x;
  credit:=round(least(60,coalesce((slot->>'minutes')::numeric,0),seconds/60)/60*coalesce((slot->>'rate')::numeric,0));
  if credit>0 then choices:=choices||jsonb_build_array(jsonb_build_object('name',slot->>'name','credit',credit,'minutes',least(60,coalesce((slot->>'minutes')::numeric,0),seconds/60)));end if;
 end loop;
 return public.loyalty_balance(r.customer_phone)||jsonb_build_object('phone',public.loyalty_phone(r.customer_phone),'choices',choices,'session_seconds',public.loyalty_seconds(to_jsonb(r),now()));
end $$;
create or replace function public.loyalty_bill_base(r jsonb) returns numeric language plpgsql stable as $$
declare slot jsonb;mins numeric;p timestamptz;remaining numeric;total numeric:=0;food numeric;m text[];e jsonb;
begin
 for slot in select * from jsonb_array_elements(public.loyalty_slots(r)) loop
  if not (slot->>'bill')::boolean then continue;end if;
  mins:=coalesce((slot->>'minutes')::numeric,0);p:=public.loyalty_pause_at(r,slot->>'name');
  if p is not null then
   remaining:=null;
   for m in select regexp_matches(coalesce(r->>'notes',''),'\[Station Paused:\s*([^|\]]+)\|[^\]]*RemainingMs:\s*(\d+)','gi') loop
    if lower(trim(m[1]))=lower(slot->>'name') then remaining:=m[2]::numeric/1000;exit;end if;
   end loop;
   if remaining is null then
    for e in select * from jsonb_array_elements(coalesce(r->'extra_stations','[]')) loop
     if lower(coalesce(e->>'station',e->>'station_name',''))=lower(slot->>'name') and e->>'is_paused'='true' then remaining:=nullif(e->>'paused_remaining_ms','')::numeric/1000;end if;
    end loop;
   end if;
   if remaining is null then m:=regexp_match(coalesce(r->>'notes',''),'\[Session:\s*Paused[^\]]*RemainingMs:\s*(\d+)','i');if m is not null then remaining:=m[1]::numeric/1000;end if;end if;
   remaining:=coalesce(remaining,greatest(0,extract(epoch from (slot->>'end')::timestamptz-p)));
   mins:=greatest(1,least(mins,round((mins*60-remaining)/60)));
  end if;
  total:=total+round(mins/60*coalesce((slot->>'rate')::numeric,0));
 end loop;
 select coalesce(sum(coalesce((x->>'price')::numeric,0)*coalesce((x->>'qty')::numeric,0)),0) into food from jsonb_array_elements(coalesce(r->'food_items','[]')) x;
 return total+food;
end $$;
-- The only checkout path that consumes a reward: one transaction with the session payment.
create or replace function public.loyalty_checkout(p_staff_id uuid,p_session_id uuid,p_update jsonb,p_station text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.sessions; slot jsonb; seconds numeric; credit numeric; reward public.loyalty_rewards; actor text; allowed text[]:=array['status','end_time','paid','payment_method','cash_amount','online_amount','paid_amount','due_amount','paid_at','amount','overtime_amount','discount_amount','discount_type','discount_value','notes'];k text;
begin
 select name into actor from public.staff where id=p_staff_id and active;if actor is null then raise exception 'An active staff member is required';end if;
 select * into r from public.sessions where id=p_session_id for update;if not found then raise exception 'Session not found';end if;
 perform pg_advisory_xact_lock(hashtextextended('loyalty:'||public.loyalty_phone(r.customer_phone),0));
 select * into reward from public.loyalty_rewards where session_id=r.id and voided_at is null;
 if found then
  if r.status='Completed' and lower(reward.station_name)=lower(p_station) and reward.checkout_payload=p_update then return to_jsonb(r);end if;
  raise exception 'This session already redeemed a reward';
 end if;
 if exists(select 1 from public.loyalty_rewards where session_id=r.id) then raise exception 'This returned reward belongs to an earlier checkout; start a new session to redeem it again';end if;
 if r.status<>'Active' or public.loyalty_phone(r.customer_phone)='' then raise exception 'An active gaming session with a customer phone is required';end if;
 if (public.loyalty_balance(r.customer_phone)->>'available')::int<1 then raise exception 'No free-hour reward is available';end if;
 if p_update->>'status' is distinct from 'Completed' or coalesce(p_update->>'notes','') ilike '%[Payment: Waived%' or coalesce(p_update->>'notes','') ilike '%[Internal Sale]%' then raise exception 'Complete a regular session to redeem a reward';end if;
 for k in select jsonb_object_keys(p_update) loop if not k=any(allowed) then raise exception 'Unsupported checkout field: %',k;end if;end loop;
 select x into slot from jsonb_array_elements(public.loyalty_slots(to_jsonb(r))) x where lower(x->>'name')=lower(p_station);
 if slot is null then raise exception 'Select a station in this session';end if;
 select coalesce(sum(extract(epoch from upper(x)-lower(x))),0) into seconds from unnest(public.loyalty_play_ranges(to_jsonb(r),clock_timestamp(),p_station)) x;
 -- Credit cannot exceed one hour, the selected station's booked charge, or its elapsed play.
 credit:=round(least(60,coalesce((slot->>'minutes')::numeric,0),seconds/60)/60*coalesce((slot->>'rate')::numeric,0));
 if credit<=0 then raise exception 'The selected station has no eligible playing time';end if;
 if coalesce((p_update->>'discount_value')::numeric,0)<>0 or coalesce((p_update->>'discount_amount')::numeric,0)>credit or coalesce((p_update->>'discount_amount')::numeric,0)<=0 then raise exception 'Reward amount changed; reopen checkout and try again';end if;
 credit:=(p_update->>'discount_amount')::numeric;
 if p_update->>'amount' is null or (p_update->>'amount')::numeric<>greatest(0,public.loyalty_bill_base(to_jsonb(r))+coalesce((p_update->>'overtime_amount')::numeric,0)-credit) then raise exception 'Bill changed; reopen checkout to refresh the free-hour credit';end if;
 if coalesce((p_update->>'overtime_amount')::numeric,0)<0 or coalesce((p_update->>'paid_amount')::numeric,0)<0 or coalesce((p_update->>'due_amount')::numeric,0)<0 or coalesce((p_update->>'paid_amount')::numeric,0)+coalesce((p_update->>'due_amount')::numeric,0)<>(p_update->>'amount')::numeric then raise exception 'Invalid reward checkout payment totals';end if;
 if coalesce((p_update->>'cash_amount')::numeric,0)<0 or coalesce((p_update->>'online_amount')::numeric,0)<0 or coalesce((p_update->>'cash_amount')::numeric,0)+coalesce((p_update->>'online_amount')::numeric,0)<>coalesce((p_update->>'paid_amount')::numeric,0) then raise exception 'Invalid reward checkout cash/bank totals';end if;
 if (p_update->>'amount')::numeric<r.food_total then raise exception 'A loyalty reward cannot discount food';end if;
 insert into public.loyalty_rewards(session_id,phone,station_name,discount,staff_name,checkout_payload) values(r.id,public.loyalty_phone(r.customer_phone),slot->>'name',credit,actor,p_update);
 p_update:=p_update||jsonb_build_object('loyalty_discount',credit);
 r:=jsonb_populate_record(r,p_update);
 update public.sessions set status=r.status,end_time=r.end_time,paid=r.paid,payment_method=r.payment_method,cash_amount=r.cash_amount,online_amount=r.online_amount,paid_amount=r.paid_amount,due_amount=r.due_amount,paid_at=r.paid_at,amount=r.amount,overtime_amount=r.overtime_amount,discount_amount=r.discount_amount,discount_type=r.discount_type,discount_value=r.discount_value,notes=r.notes,loyalty_discount=credit where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
-- Backfill only once; refreshes through triggers after future edits/cancellation.
update public.sessions set loyalty_historical=true,loyalty_completed_at=coalesce(end_time,start_time+make_interval(mins=>duration_minutes)) where status='Completed' and not exists(select 1 from public.loyalty_visits where session_id=sessions.id);
alter table public.loyalty_visits enable row level security;
alter table public.loyalty_rewards enable row level security;
drop policy if exists loyalty_read on public.loyalty_visits;
create policy loyalty_read on public.loyalty_visits for select to anon,authenticated using(true);
drop policy if exists loyalty_read on public.loyalty_rewards;
create policy loyalty_read on public.loyalty_rewards for select to anon,authenticated using(true);
revoke all on public.loyalty_visits,public.loyalty_rewards from anon,authenticated;
grant select on public.loyalty_visits,public.loyalty_rewards to anon,authenticated;
revoke all on function public.loyalty_phone(text),public.loyalty_time(text,timestamptz),public.loyalty_slots(jsonb),public.loyalty_pause_at(jsonb,text),public.loyalty_play_ranges(jsonb,timestamptz,text),public.loyalty_seconds(jsonb,timestamptz),public.loyalty_capture(),public.loyalty_accrue(),public.loyalty_balance(text),public.loyalty_quote(uuid),public.loyalty_bill_base(jsonb),public.loyalty_checkout(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.loyalty_balance(text),public.loyalty_quote(uuid),public.loyalty_checkout(uuid,uuid,jsonb,text) to anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  begin alter publication supabase_realtime add table public.loyalty_visits;exception when duplicate_object then null;end;
  begin alter publication supabase_realtime add table public.loyalty_rewards;exception when duplicate_object then null;end;
 end if;
end $$;

notify pgrst, 'reload schema';
commit;

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

-- Loyalty timestamps and saved-end-time eligibility, including explicit overtime waivers.
begin;
alter table public.loyalty_visits add column if not exists start_time timestamptz;
alter table public.loyalty_visits add column if not exists end_time timestamptz;
create or replace function public.loyalty_play_ranges(r jsonb,cutoff timestamptz,p_name text default null) returns tstzmultirange language plpgsql stable as $$
declare total tstzmultirange:='{}'; span tstzmultirange; slot jsonb; p jsonb; m text[]; s timestamptz; f timestamptz; stop timestamptz; known numeric; excess numeric;
begin
 for slot in select * from jsonb_array_elements(public.loyalty_slots(r)) loop
  if p_name is not null and lower(slot->>'name')<>lower(p_name) then continue;end if;
  s:=(slot->>'start')::timestamptz;f:=least((slot->>'end')::timestamptz,cutoff);if s is null or f is null or f<=s then continue;end if;
  for m in select regexp_matches(coalesce(r->>'notes',''),'\[Station Completed:\s*([^|\]]+)\|\s*At:\s*([^|\]]+)','gi') loop
   if lower(trim(m[1]))=lower(slot->>'name') then f:=least(f,public.loyalty_time(trim(m[2]),s));end if;
  end loop;
  stop:=public.loyalty_pause_at(r,slot->>'name');if stop is not null then f:=least(f,stop);end if;
  if f<=s then continue;end if;
  span:=tstzmultirange(tstzrange(s,f,'[)'));known:=0;
  for p in select * from jsonb_array_elements(coalesce(r->'loyalty_pauses','[]')) loop
   if lower(p->>'station')=lower(slot->>'name') and (p->>'to')::timestamptz>(p->>'from')::timestamptz then
    span:=span-tstzmultirange(tstzrange((p->>'from')::timestamptz,(p->>'to')::timestamptz,'[)'));
    known:=known+extract(epoch from (p->>'to')::timestamptz-(p->>'from')::timestamptz);
   end if;
  end loop;
  -- Saved end times are authoritative. Only explicitly waived overtime is capped.
  if coalesce(r->>'notes','') like '%[Overtime Waived]%' then
   span:=span*tstzmultirange(tstzrange(s,least(f,s+make_interval(secs=>(coalesce((slot->>'minutes')::numeric,0)*60+known)::double precision)),'[)'));
  end if;
  total:=total+span;
 end loop;return total;
end $$;
create or replace function public.loyalty_accrue() returns trigger language plpgsql security definer set search_path=public as $$
declare spans tstzmultirange;first_at timestamptz;last_at timestamptz;secs integer;phone text:=public.loyalty_phone(new.customer_phone);
begin
 if new.status='Completed' and phone<>'' and jsonb_array_length(public.loyalty_slots(to_jsonb(new)))>0 and coalesce(new.notes,'') not ilike '%[Payment: Waived%' and coalesce(new.notes,'') not ilike '%[Internal Sale]%' then
  spans:=public.loyalty_play_ranges(to_jsonb(new),coalesce(new.loyalty_completed_at,now()));
  select coalesce(floor(sum(extract(epoch from upper(x)-lower(x)))),0)::int,min(lower(x)),max(upper(x)) into secs,first_at,last_at from unnest(spans) x;
  insert into public.loyalty_visits(session_id,phone,customer_name,played_seconds,stamps,historical,visited_at,start_time,end_time)
  values(new.id,phone,new.customer_name,secs,floor(secs/3600.0)::int,new.loyalty_historical,new.start_time,coalesce(first_at,new.start_time),coalesce(last_at,least(new.end_time,new.loyalty_completed_at)))
  on conflict(session_id) do update set phone=excluded.phone,customer_name=excluded.customer_name,played_seconds=excluded.played_seconds,stamps=excluded.stamps,historical=excluded.historical,visited_at=excluded.visited_at,start_time=excluded.start_time,end_time=excluded.end_time,updated_at=now();
 else delete from public.loyalty_visits where session_id=new.id;end if;return new;
end $$;
create or replace function public.loyalty_checkout(p_staff_id uuid,p_session_id uuid,p_update jsonb,p_station text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.sessions; slot jsonb; seconds numeric; credit numeric; reward public.loyalty_rewards; actor text; allowed text[]:=array['status','end_time','paid','payment_method','cash_amount','online_amount','paid_amount','due_amount','paid_at','amount','overtime_amount','discount_amount','discount_type','discount_value','notes','extra_stations'];k text;
begin
 select name into actor from public.staff where id=p_staff_id and active;if actor is null then raise exception 'An active staff member is required';end if;
 select * into r from public.sessions where id=p_session_id for update;if not found then raise exception 'Session not found';end if;
 perform pg_advisory_xact_lock(hashtextextended('loyalty:'||public.loyalty_phone(r.customer_phone),0));
 select * into reward from public.loyalty_rewards where session_id=r.id and voided_at is null;
 if found then
  if r.status='Completed' and lower(reward.station_name)=lower(p_station) and reward.checkout_payload=p_update then return to_jsonb(r);end if;
  raise exception 'This session already redeemed a reward';
 end if;
 if exists(select 1 from public.loyalty_rewards where session_id=r.id) then raise exception 'This returned reward belongs to an earlier checkout; start a new session to redeem it again';end if;
 if r.status<>'Active' or public.loyalty_phone(r.customer_phone)='' then raise exception 'An active gaming session with a customer phone is required';end if;
 if (public.loyalty_balance(r.customer_phone)->>'available')::int<1 then raise exception 'No free-hour reward is available';end if;
 if p_update->>'status' is distinct from 'Completed' or coalesce(p_update->>'notes','') ilike '%[Payment: Waived%' or coalesce(p_update->>'notes','') ilike '%[Internal Sale]%' then raise exception 'Complete a regular session to redeem a reward';end if;
 for k in select jsonb_object_keys(p_update) loop if not k=any(allowed) then raise exception 'Unsupported checkout field: %',k;end if;end loop;
 select x into slot from jsonb_array_elements(public.loyalty_slots(to_jsonb(r))) x where lower(x->>'name')=lower(p_station);
 if slot is null then raise exception 'Select a station in this session';end if;
 select coalesce(sum(extract(epoch from upper(x)-lower(x))),0) into seconds from unnest(public.loyalty_play_ranges(to_jsonb(r),clock_timestamp(),p_station)) x;
 -- Credit cannot exceed one hour, the selected station's booked charge, or its elapsed play.
 credit:=round(least(60,coalesce((slot->>'minutes')::numeric,0),seconds/60)/60*coalesce((slot->>'rate')::numeric,0));
 if credit<=0 then raise exception 'The selected station has no eligible playing time';end if;
 if coalesce((p_update->>'discount_value')::numeric,0)<>0 or coalesce((p_update->>'discount_amount')::numeric,0)>credit or coalesce((p_update->>'discount_amount')::numeric,0)<=0 then raise exception 'Reward amount changed; reopen checkout and try again';end if;
 credit:=(p_update->>'discount_amount')::numeric;
 if p_update->>'amount' is null or (p_update->>'amount')::numeric<>greatest(0,public.loyalty_bill_base(to_jsonb(r))+coalesce((p_update->>'overtime_amount')::numeric,0)-credit) then raise exception 'Bill changed; reopen checkout to refresh the free-hour credit';end if;
 if coalesce((p_update->>'overtime_amount')::numeric,0)<0 or coalesce((p_update->>'paid_amount')::numeric,0)<0 or coalesce((p_update->>'due_amount')::numeric,0)<0 or coalesce((p_update->>'paid_amount')::numeric,0)+coalesce((p_update->>'due_amount')::numeric,0)<>(p_update->>'amount')::numeric then raise exception 'Invalid reward checkout payment totals';end if;
 if coalesce((p_update->>'cash_amount')::numeric,0)<0 or coalesce((p_update->>'online_amount')::numeric,0)<0 or coalesce((p_update->>'cash_amount')::numeric,0)+coalesce((p_update->>'online_amount')::numeric,0)<>coalesce((p_update->>'paid_amount')::numeric,0) then raise exception 'Invalid reward checkout cash/bank totals';end if;
 if (p_update->>'amount')::numeric<r.food_total then raise exception 'A loyalty reward cannot discount food';end if;
 insert into public.loyalty_rewards(session_id,phone,station_name,discount,staff_name,checkout_payload) values(r.id,public.loyalty_phone(r.customer_phone),slot->>'name',credit,actor,p_update);
 p_update:=p_update||jsonb_build_object('loyalty_discount',credit);
 r:=jsonb_populate_record(r,p_update);
 update public.sessions set status=r.status,end_time=r.end_time,paid=r.paid,payment_method=r.payment_method,cash_amount=r.cash_amount,online_amount=r.online_amount,paid_amount=r.paid_amount,due_amount=r.due_amount,paid_at=r.paid_at,amount=r.amount,overtime_amount=r.overtime_amount,discount_amount=r.discount_amount,discount_type=r.discount_type,discount_value=r.discount_value,notes=r.notes,extra_stations=r.extra_stations,loyalty_discount=credit where id=r.id returning * into r;
 return to_jsonb(r);
end $$;

update public.sessions set notes=notes where status='Completed';
revoke all on function public.loyalty_accrue(),public.loyalty_play_ranges(jsonb,timestamptz,text),public.loyalty_checkout(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.loyalty_checkout(uuid,uuid,jsonb,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;

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

-- Monthly detail cleanup. Keep financial books, daily analytics and loyalty balances.
begin;
-- Bikram Sambat month boundaries from the bundled MIT nepali-date-converter 3.4.0.
create table if not exists public.archive_nepali_months (year integer not null,month integer not null,start_date date not null unique,primary key(year,month));
insert into public.archive_nepali_months values
(2000,1,'1943-04-14'),
(2000,2,'1943-05-14'),
(2000,3,'1943-06-15'),
(2000,4,'1943-07-16'),
(2000,5,'1943-08-17'),
(2000,6,'1943-09-17'),
(2000,7,'1943-10-17'),
(2000,8,'1943-11-16'),
(2000,9,'1943-12-16'),
(2000,10,'1944-01-14'),
(2000,11,'1944-02-13'),
(2000,12,'1944-03-13'),
(2001,1,'1944-04-13'),
(2001,2,'1944-05-14'),
(2001,3,'1944-06-14'),
(2001,4,'1944-07-16'),
(2001,5,'1944-08-16'),
(2001,6,'1944-09-16'),
(2001,7,'1944-10-17'),
(2001,8,'1944-11-16'),
(2001,9,'1944-12-15'),
(2001,10,'1945-01-14'),
(2001,11,'1945-02-12'),
(2001,12,'1945-03-14'),
(2002,1,'1945-04-13'),
(2002,2,'1945-05-14'),
(2002,3,'1945-06-14'),
(2002,4,'1945-07-16'),
(2002,5,'1945-08-17'),
(2002,6,'1945-09-17'),
(2002,7,'1945-10-17'),
(2002,8,'1945-11-16'),
(2002,9,'1945-12-15'),
(2002,10,'1946-01-14'),
(2002,11,'1946-02-12'),
(2002,12,'1946-03-14'),
(2003,1,'1946-04-13'),
(2003,2,'1946-05-14'),
(2003,3,'1946-06-15'),
(2003,4,'1946-07-16'),
(2003,5,'1946-08-17'),
(2003,6,'1946-09-17'),
(2003,7,'1946-10-17'),
(2003,8,'1946-11-16'),
(2003,9,'1946-12-16'),
(2003,10,'1947-01-14'),
(2003,11,'1947-02-12'),
(2003,12,'1947-03-14'),
(2004,1,'1947-04-14'),
(2004,2,'1947-05-14'),
(2004,3,'1947-06-15'),
(2004,4,'1947-07-16'),
(2004,5,'1947-08-17'),
(2004,6,'1947-09-17'),
(2004,7,'1947-10-17'),
(2004,8,'1947-11-16'),
(2004,9,'1947-12-16'),
(2004,10,'1948-01-14'),
(2004,11,'1948-02-13'),
(2004,12,'1948-03-13'),
(2005,1,'1948-04-13'),
(2005,2,'1948-05-14'),
(2005,3,'1948-06-14'),
(2005,4,'1948-07-16'),
(2005,5,'1948-08-16'),
(2005,6,'1948-09-16'),
(2005,7,'1948-10-17'),
(2005,8,'1948-11-16'),
(2005,9,'1948-12-15'),
(2005,10,'1949-01-14'),
(2005,11,'1949-02-12'),
(2005,12,'1949-03-14'),
(2006,1,'1949-04-13'),
(2006,2,'1949-05-14'),
(2006,3,'1949-06-14'),
(2006,4,'1949-07-16'),
(2006,5,'1949-08-17'),
(2006,6,'1949-09-17'),
(2006,7,'1949-10-17'),
(2006,8,'1949-11-16'),
(2006,9,'1949-12-15'),
(2006,10,'1950-01-14'),
(2006,11,'1950-02-12'),
(2006,12,'1950-03-14'),
(2007,1,'1950-04-13'),
(2007,2,'1950-05-14'),
(2007,3,'1950-06-15'),
(2007,4,'1950-07-16'),
(2007,5,'1950-08-17'),
(2007,6,'1950-09-17'),
(2007,7,'1950-10-17'),
(2007,8,'1950-11-16'),
(2007,9,'1950-12-16'),
(2007,10,'1951-01-14'),
(2007,11,'1951-02-12'),
(2007,12,'1951-03-14'),
(2008,1,'1951-04-14'),
(2008,2,'1951-05-15'),
(2008,3,'1951-06-15'),
(2008,4,'1951-07-16'),
(2008,5,'1951-08-17'),
(2008,6,'1951-09-17'),
(2008,7,'1951-10-18'),
(2008,8,'1951-11-16'),
(2008,9,'1951-12-16'),
(2008,10,'1952-01-15'),
(2008,11,'1952-02-13'),
(2008,12,'1952-03-13'),
(2009,1,'1952-04-13'),
(2009,2,'1952-05-14'),
(2009,3,'1952-06-14'),
(2009,4,'1952-07-16'),
(2009,5,'1952-08-16'),
(2009,6,'1952-09-16'),
(2009,7,'1952-10-17'),
(2009,8,'1952-11-16'),
(2009,9,'1952-12-15'),
(2009,10,'1953-01-14'),
(2009,11,'1953-02-12'),
(2009,12,'1953-03-14'),
(2010,1,'1953-04-13'),
(2010,2,'1953-05-14'),
(2010,3,'1953-06-14'),
(2010,4,'1953-07-16'),
(2010,5,'1953-08-17'),
(2010,6,'1953-09-17'),
(2010,7,'1953-10-17'),
(2010,8,'1953-11-16'),
(2010,9,'1953-12-15'),
(2010,10,'1954-01-14'),
(2010,11,'1954-02-12'),
(2010,12,'1954-03-14'),
(2011,1,'1954-04-13'),
(2011,2,'1954-05-14'),
(2011,3,'1954-06-15'),
(2011,4,'1954-07-16'),
(2011,5,'1954-08-17'),
(2011,6,'1954-09-17'),
(2011,7,'1954-10-17'),
(2011,8,'1954-11-16'),
(2011,9,'1954-12-16'),
(2011,10,'1955-01-14'),
(2011,11,'1955-02-12'),
(2011,12,'1955-03-14'),
(2012,1,'1955-04-14'),
(2012,2,'1955-05-15'),
(2012,3,'1955-06-15'),
(2012,4,'1955-07-16'),
(2012,5,'1955-08-17'),
(2012,6,'1955-09-17'),
(2012,7,'1955-10-18'),
(2012,8,'1955-11-16'),
(2012,9,'1955-12-16'),
(2012,10,'1956-01-15'),
(2012,11,'1956-02-13'),
(2012,12,'1956-03-14'),
(2013,1,'1956-04-13'),
(2013,2,'1956-05-14'),
(2013,3,'1956-06-14'),
(2013,4,'1956-07-16'),
(2013,5,'1956-08-16'),
(2013,6,'1956-09-16'),
(2013,7,'1956-10-17'),
(2013,8,'1956-11-16'),
(2013,9,'1956-12-15'),
(2013,10,'1957-01-14'),
(2013,11,'1957-02-12'),
(2013,12,'1957-03-14'),
(2014,1,'1957-04-13'),
(2014,2,'1957-05-14'),
(2014,3,'1957-06-14'),
(2014,4,'1957-07-16'),
(2014,5,'1957-08-17'),
(2014,6,'1957-09-17'),
(2014,7,'1957-10-17'),
(2014,8,'1957-11-16'),
(2014,9,'1957-12-15'),
(2014,10,'1958-01-14'),
(2014,11,'1958-02-12'),
(2014,12,'1958-03-14'),
(2015,1,'1958-04-13'),
(2015,2,'1958-05-14'),
(2015,3,'1958-06-15'),
(2015,4,'1958-07-16'),
(2015,5,'1958-08-17'),
(2015,6,'1958-09-17'),
(2015,7,'1958-10-17'),
(2015,8,'1958-11-16'),
(2015,9,'1958-12-16'),
(2015,10,'1959-01-14'),
(2015,11,'1959-02-12'),
(2015,12,'1959-03-14'),
(2016,1,'1959-04-14'),
(2016,2,'1959-05-15'),
(2016,3,'1959-06-15'),
(2016,4,'1959-07-16'),
(2016,5,'1959-08-17'),
(2016,6,'1959-09-17'),
(2016,7,'1959-10-18'),
(2016,8,'1959-11-16'),
(2016,9,'1959-12-16'),
(2016,10,'1960-01-15'),
(2016,11,'1960-02-13'),
(2016,12,'1960-03-14'),
(2017,1,'1960-04-13'),
(2017,2,'1960-05-14'),
(2017,3,'1960-06-14'),
(2017,4,'1960-07-16'),
(2017,5,'1960-08-16'),
(2017,6,'1960-09-16'),
(2017,7,'1960-10-17'),
(2017,8,'1960-11-16'),
(2017,9,'1960-12-15'),
(2017,10,'1961-01-14'),
(2017,11,'1961-02-12'),
(2017,12,'1961-03-14'),
(2018,1,'1961-04-13'),
(2018,2,'1961-05-14'),
(2018,3,'1961-06-15'),
(2018,4,'1961-07-16'),
(2018,5,'1961-08-17'),
(2018,6,'1961-09-17'),
(2018,7,'1961-10-17'),
(2018,8,'1961-11-16'),
(2018,9,'1961-12-15'),
(2018,10,'1962-01-14'),
(2018,11,'1962-02-12'),
(2018,12,'1962-03-14'),
(2019,1,'1962-04-13'),
(2019,2,'1962-05-14'),
(2019,3,'1962-06-15'),
(2019,4,'1962-07-16'),
(2019,5,'1962-08-17'),
(2019,6,'1962-09-17'),
(2019,7,'1962-10-17'),
(2019,8,'1962-11-16'),
(2019,9,'1962-12-16'),
(2019,10,'1963-01-14'),
(2019,11,'1963-02-13'),
(2019,12,'1963-03-14'),
(2020,1,'1963-04-14'),
(2020,2,'1963-05-15'),
(2020,3,'1963-06-15'),
(2020,4,'1963-07-16'),
(2020,5,'1963-08-17'),
(2020,6,'1963-09-17'),
(2020,7,'1963-10-18'),
(2020,8,'1963-11-17'),
(2020,9,'1963-12-16'),
(2020,10,'1964-01-15'),
(2020,11,'1964-02-13'),
(2020,12,'1964-03-14'),
(2021,1,'1964-04-13'),
(2021,2,'1964-05-14'),
(2021,3,'1964-06-14'),
(2021,4,'1964-07-16'),
(2021,5,'1964-08-16'),
(2021,6,'1964-09-16'),
(2021,7,'1964-10-17'),
(2021,8,'1964-11-16'),
(2021,9,'1964-12-15'),
(2021,10,'1965-01-14'),
(2021,11,'1965-02-12'),
(2021,12,'1965-03-14'),
(2022,1,'1965-04-13'),
(2022,2,'1965-05-14'),
(2022,3,'1965-06-15'),
(2022,4,'1965-07-16'),
(2022,5,'1965-08-17'),
(2022,6,'1965-09-17'),
(2022,7,'1965-10-17'),
(2022,8,'1965-11-16'),
(2022,9,'1965-12-16'),
(2022,10,'1966-01-14'),
(2022,11,'1966-02-12'),
(2022,12,'1966-03-14'),
(2023,1,'1966-04-13'),
(2023,2,'1966-05-14'),
(2023,3,'1966-06-15'),
(2023,4,'1966-07-16'),
(2023,5,'1966-08-17'),
(2023,6,'1966-09-17'),
(2023,7,'1966-10-17'),
(2023,8,'1966-11-16'),
(2023,9,'1966-12-16'),
(2023,10,'1967-01-14'),
(2023,11,'1967-02-13'),
(2023,12,'1967-03-14'),
(2024,1,'1967-04-14'),
(2024,2,'1967-05-15'),
(2024,3,'1967-06-15'),
(2024,4,'1967-07-16'),
(2024,5,'1967-08-17'),
(2024,6,'1967-09-17'),
(2024,7,'1967-10-18'),
(2024,8,'1967-11-17'),
(2024,9,'1967-12-16'),
(2024,10,'1968-01-15'),
(2024,11,'1968-02-13'),
(2024,12,'1968-03-14'),
(2025,1,'1968-04-13'),
(2025,2,'1968-05-14'),
(2025,3,'1968-06-14'),
(2025,4,'1968-07-16'),
(2025,5,'1968-08-16'),
(2025,6,'1968-09-16'),
(2025,7,'1968-10-17'),
(2025,8,'1968-11-16'),
(2025,9,'1968-12-15'),
(2025,10,'1969-01-14'),
(2025,11,'1969-02-12'),
(2025,12,'1969-03-14'),
(2026,1,'1969-04-13'),
(2026,2,'1969-05-14'),
(2026,3,'1969-06-15'),
(2026,4,'1969-07-16'),
(2026,5,'1969-08-17'),
(2026,6,'1969-09-17'),
(2026,7,'1969-10-17'),
(2026,8,'1969-11-16'),
(2026,9,'1969-12-16'),
(2026,10,'1970-01-14'),
(2026,11,'1970-02-12'),
(2026,12,'1970-03-14'),
(2027,1,'1970-04-14'),
(2027,2,'1970-05-14'),
(2027,3,'1970-06-15'),
(2027,4,'1970-07-16'),
(2027,5,'1970-08-17'),
(2027,6,'1970-09-17'),
(2027,7,'1970-10-17'),
(2027,8,'1970-11-16'),
(2027,9,'1970-12-16'),
(2027,10,'1971-01-14'),
(2027,11,'1971-02-13'),
(2027,12,'1971-03-14'),
(2028,1,'1971-04-14'),
(2028,2,'1971-05-15'),
(2028,3,'1971-06-15'),
(2028,4,'1971-07-17'),
(2028,5,'1971-08-17'),
(2028,6,'1971-09-17'),
(2028,7,'1971-10-18'),
(2028,8,'1971-11-17'),
(2028,9,'1971-12-16'),
(2028,10,'1972-01-15'),
(2028,11,'1972-02-13'),
(2028,12,'1972-03-14'),
(2029,1,'1972-04-13'),
(2029,2,'1972-05-14'),
(2029,3,'1972-06-14'),
(2029,4,'1972-07-16'),
(2029,5,'1972-08-16'),
(2029,6,'1972-09-17'),
(2029,7,'1972-10-17'),
(2029,8,'1972-11-16'),
(2029,9,'1972-12-15'),
(2029,10,'1973-01-14'),
(2029,11,'1973-02-12'),
(2029,12,'1973-03-14'),
(2030,1,'1973-04-13'),
(2030,2,'1973-05-14'),
(2030,3,'1973-06-15'),
(2030,4,'1973-07-16'),
(2030,5,'1973-08-17'),
(2030,6,'1973-09-17'),
(2030,7,'1973-10-17'),
(2030,8,'1973-11-16'),
(2030,9,'1973-12-16'),
(2030,10,'1974-01-14'),
(2030,11,'1974-02-12'),
(2030,12,'1974-03-14'),
(2031,1,'1974-04-14'),
(2031,2,'1974-05-14'),
(2031,3,'1974-06-15'),
(2031,4,'1974-07-16'),
(2031,5,'1974-08-17'),
(2031,6,'1974-09-17'),
(2031,7,'1974-10-17'),
(2031,8,'1974-11-16'),
(2031,9,'1974-12-16'),
(2031,10,'1975-01-14'),
(2031,11,'1975-02-13'),
(2031,12,'1975-03-14'),
(2032,1,'1975-04-14'),
(2032,2,'1975-05-15'),
(2032,3,'1975-06-15'),
(2032,4,'1975-07-17'),
(2032,5,'1975-08-17'),
(2032,6,'1975-09-17'),
(2032,7,'1975-10-18'),
(2032,8,'1975-11-17'),
(2032,9,'1975-12-16'),
(2032,10,'1976-01-15'),
(2032,11,'1976-02-13'),
(2032,12,'1976-03-14'),
(2033,1,'1976-04-13'),
(2033,2,'1976-05-14'),
(2033,3,'1976-06-14'),
(2033,4,'1976-07-16'),
(2033,5,'1976-08-17'),
(2033,6,'1976-09-17'),
(2033,7,'1976-10-17'),
(2033,8,'1976-11-16'),
(2033,9,'1976-12-15'),
(2033,10,'1977-01-14'),
(2033,11,'1977-02-12'),
(2033,12,'1977-03-14'),
(2034,1,'1977-04-13'),
(2034,2,'1977-05-14'),
(2034,3,'1977-06-15'),
(2034,4,'1977-07-16'),
(2034,5,'1977-08-17'),
(2034,6,'1977-09-17'),
(2034,7,'1977-10-17'),
(2034,8,'1977-11-16'),
(2034,9,'1977-12-16'),
(2034,10,'1978-01-14'),
(2034,11,'1978-02-12'),
(2034,12,'1978-03-14'),
(2035,1,'1978-04-14'),
(2035,2,'1978-05-14'),
(2035,3,'1978-06-15'),
(2035,4,'1978-07-16'),
(2035,5,'1978-08-17'),
(2035,6,'1978-09-17'),
(2035,7,'1978-10-18'),
(2035,8,'1978-11-16'),
(2035,9,'1978-12-16'),
(2035,10,'1979-01-15'),
(2035,11,'1979-02-13'),
(2035,12,'1979-03-14'),
(2036,1,'1979-04-14'),
(2036,2,'1979-05-15'),
(2036,3,'1979-06-15'),
(2036,4,'1979-07-17'),
(2036,5,'1979-08-17'),
(2036,6,'1979-09-17'),
(2036,7,'1979-10-18'),
(2036,8,'1979-11-17'),
(2036,9,'1979-12-16'),
(2036,10,'1980-01-15'),
(2036,11,'1980-02-13'),
(2036,12,'1980-03-14'),
(2037,1,'1980-04-13'),
(2037,2,'1980-05-14'),
(2037,3,'1980-06-14'),
(2037,4,'1980-07-16'),
(2037,5,'1980-08-17'),
(2037,6,'1980-09-17'),
(2037,7,'1980-10-17'),
(2037,8,'1980-11-16'),
(2037,9,'1980-12-15'),
(2037,10,'1981-01-14'),
(2037,11,'1981-02-12'),
(2037,12,'1981-03-14'),
(2038,1,'1981-04-13'),
(2038,2,'1981-05-14'),
(2038,3,'1981-06-15'),
(2038,4,'1981-07-16'),
(2038,5,'1981-08-17'),
(2038,6,'1981-09-17'),
(2038,7,'1981-10-17'),
(2038,8,'1981-11-16'),
(2038,9,'1981-12-16'),
(2038,10,'1982-01-14'),
(2038,11,'1982-02-12'),
(2038,12,'1982-03-14'),
(2039,1,'1982-04-14'),
(2039,2,'1982-05-15'),
(2039,3,'1982-06-15'),
(2039,4,'1982-07-16'),
(2039,5,'1982-08-17'),
(2039,6,'1982-09-17'),
(2039,7,'1982-10-18'),
(2039,8,'1982-11-16'),
(2039,9,'1982-12-16'),
(2039,10,'1983-01-15'),
(2039,11,'1983-02-13'),
(2039,12,'1983-03-15'),
(2040,1,'1983-04-14'),
(2040,2,'1983-05-15'),
(2040,3,'1983-06-15'),
(2040,4,'1983-07-17'),
(2040,5,'1983-08-17'),
(2040,6,'1983-09-17'),
(2040,7,'1983-10-18'),
(2040,8,'1983-11-17'),
(2040,9,'1983-12-16'),
(2040,10,'1984-01-15'),
(2040,11,'1984-02-13'),
(2040,12,'1984-03-14'),
(2041,1,'1984-04-13'),
(2041,2,'1984-05-14'),
(2041,3,'1984-06-14'),
(2041,4,'1984-07-16'),
(2041,5,'1984-08-17'),
(2041,6,'1984-09-17'),
(2041,7,'1984-10-17'),
(2041,8,'1984-11-16'),
(2041,9,'1984-12-15'),
(2041,10,'1985-01-14'),
(2041,11,'1985-02-12'),
(2041,12,'1985-03-14'),
(2042,1,'1985-04-13'),
(2042,2,'1985-05-14'),
(2042,3,'1985-06-15'),
(2042,4,'1985-07-16'),
(2042,5,'1985-08-17'),
(2042,6,'1985-09-17'),
(2042,7,'1985-10-17'),
(2042,8,'1985-11-16'),
(2042,9,'1985-12-16'),
(2042,10,'1986-01-14'),
(2042,11,'1986-02-12'),
(2042,12,'1986-03-14'),
(2043,1,'1986-04-14'),
(2043,2,'1986-05-15'),
(2043,3,'1986-06-15'),
(2043,4,'1986-07-16'),
(2043,5,'1986-08-17'),
(2043,6,'1986-09-17'),
(2043,7,'1986-10-18'),
(2043,8,'1986-11-16'),
(2043,9,'1986-12-16'),
(2043,10,'1987-01-15'),
(2043,11,'1987-02-13'),
(2043,12,'1987-03-15'),
(2044,1,'1987-04-14'),
(2044,2,'1987-05-15'),
(2044,3,'1987-06-15'),
(2044,4,'1987-07-17'),
(2044,5,'1987-08-17'),
(2044,6,'1987-09-17'),
(2044,7,'1987-10-18'),
(2044,8,'1987-11-17'),
(2044,9,'1987-12-16'),
(2044,10,'1988-01-15'),
(2044,11,'1988-02-13'),
(2044,12,'1988-03-14'),
(2045,1,'1988-04-13'),
(2045,2,'1988-05-14'),
(2045,3,'1988-06-15'),
(2045,4,'1988-07-16'),
(2045,5,'1988-08-17'),
(2045,6,'1988-09-17'),
(2045,7,'1988-10-17'),
(2045,8,'1988-11-16'),
(2045,9,'1988-12-15'),
(2045,10,'1989-01-14'),
(2045,11,'1989-02-12'),
(2045,12,'1989-03-14'),
(2046,1,'1989-04-13'),
(2046,2,'1989-05-14'),
(2046,3,'1989-06-15'),
(2046,4,'1989-07-16'),
(2046,5,'1989-08-17'),
(2046,6,'1989-09-17'),
(2046,7,'1989-10-17'),
(2046,8,'1989-11-16'),
(2046,9,'1989-12-16'),
(2046,10,'1990-01-14'),
(2046,11,'1990-02-12'),
(2046,12,'1990-03-14'),
(2047,1,'1990-04-14'),
(2047,2,'1990-05-15'),
(2047,3,'1990-06-15'),
(2047,4,'1990-07-16'),
(2047,5,'1990-08-17'),
(2047,6,'1990-09-17'),
(2047,7,'1990-10-18'),
(2047,8,'1990-11-17'),
(2047,9,'1990-12-16'),
(2047,10,'1991-01-15'),
(2047,11,'1991-02-13'),
(2047,12,'1991-03-15'),
(2048,1,'1991-04-14'),
(2048,2,'1991-05-15'),
(2048,3,'1991-06-15'),
(2048,4,'1991-07-17'),
(2048,5,'1991-08-17'),
(2048,6,'1991-09-17'),
(2048,7,'1991-10-18'),
(2048,8,'1991-11-17'),
(2048,9,'1991-12-16'),
(2048,10,'1992-01-15'),
(2048,11,'1992-02-13'),
(2048,12,'1992-03-14'),
(2049,1,'1992-04-13'),
(2049,2,'1992-05-14'),
(2049,3,'1992-06-15'),
(2049,4,'1992-07-16'),
(2049,5,'1992-08-17'),
(2049,6,'1992-09-17'),
(2049,7,'1992-10-17'),
(2049,8,'1992-11-16'),
(2049,9,'1992-12-16'),
(2049,10,'1993-01-14'),
(2049,11,'1993-02-12'),
(2049,12,'1993-03-14'),
(2050,1,'1993-04-13'),
(2050,2,'1993-05-14'),
(2050,3,'1993-06-15'),
(2050,4,'1993-07-16'),
(2050,5,'1993-08-17'),
(2050,6,'1993-09-17'),
(2050,7,'1993-10-17'),
(2050,8,'1993-11-16'),
(2050,9,'1993-12-16'),
(2050,10,'1994-01-14'),
(2050,11,'1994-02-13'),
(2050,12,'1994-03-14'),
(2051,1,'1994-04-14'),
(2051,2,'1994-05-15'),
(2051,3,'1994-06-15'),
(2051,4,'1994-07-16'),
(2051,5,'1994-08-17'),
(2051,6,'1994-09-17'),
(2051,7,'1994-10-18'),
(2051,8,'1994-11-17'),
(2051,9,'1994-12-16'),
(2051,10,'1995-01-15'),
(2051,11,'1995-02-13'),
(2051,12,'1995-03-15'),
(2052,1,'1995-04-14'),
(2052,2,'1995-05-15'),
(2052,3,'1995-06-15'),
(2052,4,'1995-07-17'),
(2052,5,'1995-08-17'),
(2052,6,'1995-09-17'),
(2052,7,'1995-10-18'),
(2052,8,'1995-11-17'),
(2052,9,'1995-12-16'),
(2052,10,'1996-01-15'),
(2052,11,'1996-02-13'),
(2052,12,'1996-03-14'),
(2053,1,'1996-04-13'),
(2053,2,'1996-05-14'),
(2053,3,'1996-06-15'),
(2053,4,'1996-07-16'),
(2053,5,'1996-08-17'),
(2053,6,'1996-09-17'),
(2053,7,'1996-10-17'),
(2053,8,'1996-11-16'),
(2053,9,'1996-12-16'),
(2053,10,'1997-01-14'),
(2053,11,'1997-02-12'),
(2053,12,'1997-03-14'),
(2054,1,'1997-04-13'),
(2054,2,'1997-05-14'),
(2054,3,'1997-06-15'),
(2054,4,'1997-07-16'),
(2054,5,'1997-08-17'),
(2054,6,'1997-09-17'),
(2054,7,'1997-10-17'),
(2054,8,'1997-11-16'),
(2054,9,'1997-12-16'),
(2054,10,'1998-01-14'),
(2054,11,'1998-02-13'),
(2054,12,'1998-03-14'),
(2055,1,'1998-04-14'),
(2055,2,'1998-05-15'),
(2055,3,'1998-06-15'),
(2055,4,'1998-07-17'),
(2055,5,'1998-08-17'),
(2055,6,'1998-09-17'),
(2055,7,'1998-10-18'),
(2055,8,'1998-11-17'),
(2055,9,'1998-12-16'),
(2055,10,'1999-01-15'),
(2055,11,'1999-02-13'),
(2055,12,'1999-03-15'),
(2056,1,'1999-04-14'),
(2056,2,'1999-05-15'),
(2056,3,'1999-06-15'),
(2056,4,'1999-07-17'),
(2056,5,'1999-08-17'),
(2056,6,'1999-09-18'),
(2056,7,'1999-10-18'),
(2056,8,'1999-11-17'),
(2056,9,'1999-12-16'),
(2056,10,'2000-01-15'),
(2056,11,'2000-02-13'),
(2056,12,'2000-03-14'),
(2057,1,'2000-04-13'),
(2057,2,'2000-05-14'),
(2057,3,'2000-06-15'),
(2057,4,'2000-07-16'),
(2057,5,'2000-08-17'),
(2057,6,'2000-09-17'),
(2057,7,'2000-10-17'),
(2057,8,'2000-11-16'),
(2057,9,'2000-12-16'),
(2057,10,'2001-01-14'),
(2057,11,'2001-02-12'),
(2057,12,'2001-03-14'),
(2058,1,'2001-04-14'),
(2058,2,'2001-05-14'),
(2058,3,'2001-06-15'),
(2058,4,'2001-07-16'),
(2058,5,'2001-08-17'),
(2058,6,'2001-09-17'),
(2058,7,'2001-10-17'),
(2058,8,'2001-11-16'),
(2058,9,'2001-12-16'),
(2058,10,'2002-01-14'),
(2058,11,'2002-02-13'),
(2058,12,'2002-03-14'),
(2059,1,'2002-04-14'),
(2059,2,'2002-05-15'),
(2059,3,'2002-06-15'),
(2059,4,'2002-07-17'),
(2059,5,'2002-08-17'),
(2059,6,'2002-09-17'),
(2059,7,'2002-10-18'),
(2059,8,'2002-11-17'),
(2059,9,'2002-12-16'),
(2059,10,'2003-01-15'),
(2059,11,'2003-02-13'),
(2059,12,'2003-03-15'),
(2060,1,'2003-04-14'),
(2060,2,'2003-05-15'),
(2060,3,'2003-06-15'),
(2060,4,'2003-07-17'),
(2060,5,'2003-08-18'),
(2060,6,'2003-09-18'),
(2060,7,'2003-10-18'),
(2060,8,'2003-11-17'),
(2060,9,'2003-12-16'),
(2060,10,'2004-01-15'),
(2060,11,'2004-02-13'),
(2060,12,'2004-03-14'),
(2061,1,'2004-04-13'),
(2061,2,'2004-05-14'),
(2061,3,'2004-06-15'),
(2061,4,'2004-07-16'),
(2061,5,'2004-08-17'),
(2061,6,'2004-09-17'),
(2061,7,'2004-10-17'),
(2061,8,'2004-11-16'),
(2061,9,'2004-12-16'),
(2061,10,'2005-01-14'),
(2061,11,'2005-02-12'),
(2061,12,'2005-03-14'),
(2062,1,'2005-04-14'),
(2062,2,'2005-05-14'),
(2062,3,'2005-06-15'),
(2062,4,'2005-07-16'),
(2062,5,'2005-08-17'),
(2062,6,'2005-09-17'),
(2062,7,'2005-10-18'),
(2062,8,'2005-11-16'),
(2062,9,'2005-12-16'),
(2062,10,'2006-01-14'),
(2062,11,'2006-02-13'),
(2062,12,'2006-03-14'),
(2063,1,'2006-04-14'),
(2063,2,'2006-05-15'),
(2063,3,'2006-06-15'),
(2063,4,'2006-07-17'),
(2063,5,'2006-08-17'),
(2063,6,'2006-09-17'),
(2063,7,'2006-10-18'),
(2063,8,'2006-11-17'),
(2063,9,'2006-12-16'),
(2063,10,'2007-01-15'),
(2063,11,'2007-02-13'),
(2063,12,'2007-03-15'),
(2064,1,'2007-04-14'),
(2064,2,'2007-05-15'),
(2064,3,'2007-06-15'),
(2064,4,'2007-07-17'),
(2064,5,'2007-08-18'),
(2064,6,'2007-09-18'),
(2064,7,'2007-10-18'),
(2064,8,'2007-11-17'),
(2064,9,'2007-12-16'),
(2064,10,'2008-01-15'),
(2064,11,'2008-02-13'),
(2064,12,'2008-03-14'),
(2065,1,'2008-04-13'),
(2065,2,'2008-05-14'),
(2065,3,'2008-06-15'),
(2065,4,'2008-07-16'),
(2065,5,'2008-08-17'),
(2065,6,'2008-09-17'),
(2065,7,'2008-10-17'),
(2065,8,'2008-11-16'),
(2065,9,'2008-12-16'),
(2065,10,'2009-01-14'),
(2065,11,'2009-02-12'),
(2065,12,'2009-03-14'),
(2066,1,'2009-04-14'),
(2066,2,'2009-05-15'),
(2066,3,'2009-06-15'),
(2066,4,'2009-07-16'),
(2066,5,'2009-08-17'),
(2066,6,'2009-09-17'),
(2066,7,'2009-10-18'),
(2066,8,'2009-11-16'),
(2066,9,'2009-12-16'),
(2066,10,'2010-01-15'),
(2066,11,'2010-02-13'),
(2066,12,'2010-03-14'),
(2067,1,'2010-04-14'),
(2067,2,'2010-05-15'),
(2067,3,'2010-06-15'),
(2067,4,'2010-07-17'),
(2067,5,'2010-08-17'),
(2067,6,'2010-09-17'),
(2067,7,'2010-10-18'),
(2067,8,'2010-11-17'),
(2067,9,'2010-12-16'),
(2067,10,'2011-01-15'),
(2067,11,'2011-02-13'),
(2067,12,'2011-03-15'),
(2068,1,'2011-04-14'),
(2068,2,'2011-05-15'),
(2068,3,'2011-06-15'),
(2068,4,'2011-07-17'),
(2068,5,'2011-08-18'),
(2068,6,'2011-09-18'),
(2068,7,'2011-10-18'),
(2068,8,'2011-11-17'),
(2068,9,'2011-12-16'),
(2068,10,'2012-01-15'),
(2068,11,'2012-02-13'),
(2068,12,'2012-03-14'),
(2069,1,'2012-04-13'),
(2069,2,'2012-05-14'),
(2069,3,'2012-06-15'),
(2069,4,'2012-07-16'),
(2069,5,'2012-08-17'),
(2069,6,'2012-09-17'),
(2069,7,'2012-10-17'),
(2069,8,'2012-11-16'),
(2069,9,'2012-12-16'),
(2069,10,'2013-01-14'),
(2069,11,'2013-02-12'),
(2069,12,'2013-03-14'),
(2070,1,'2013-04-14'),
(2070,2,'2013-05-15'),
(2070,3,'2013-06-15'),
(2070,4,'2013-07-16'),
(2070,5,'2013-08-17'),
(2070,6,'2013-09-17'),
(2070,7,'2013-10-18'),
(2070,8,'2013-11-16'),
(2070,9,'2013-12-16'),
(2070,10,'2014-01-15'),
(2070,11,'2014-02-13'),
(2070,12,'2014-03-15'),
(2071,1,'2014-04-14'),
(2071,2,'2014-05-15'),
(2071,3,'2014-06-15'),
(2071,4,'2014-07-17'),
(2071,5,'2014-08-17'),
(2071,6,'2014-09-17'),
(2071,7,'2014-10-18'),
(2071,8,'2014-11-17'),
(2071,9,'2014-12-16'),
(2071,10,'2015-01-15'),
(2071,11,'2015-02-13'),
(2071,12,'2015-03-15'),
(2072,1,'2015-04-14'),
(2072,2,'2015-05-15'),
(2072,3,'2015-06-16'),
(2072,4,'2015-07-17'),
(2072,5,'2015-08-18'),
(2072,6,'2015-09-18'),
(2072,7,'2015-10-18'),
(2072,8,'2015-11-17'),
(2072,9,'2015-12-16'),
(2072,10,'2016-01-15'),
(2072,11,'2016-02-13'),
(2072,12,'2016-03-14'),
(2073,1,'2016-04-13'),
(2073,2,'2016-05-14'),
(2073,3,'2016-06-15'),
(2073,4,'2016-07-16'),
(2073,5,'2016-08-17'),
(2073,6,'2016-09-17'),
(2073,7,'2016-10-17'),
(2073,8,'2016-11-16'),
(2073,9,'2016-12-16'),
(2073,10,'2017-01-14'),
(2073,11,'2017-02-12'),
(2073,12,'2017-03-14'),
(2074,1,'2017-04-14'),
(2074,2,'2017-05-15'),
(2074,3,'2017-06-15'),
(2074,4,'2017-07-16'),
(2074,5,'2017-08-17'),
(2074,6,'2017-09-17'),
(2074,7,'2017-10-18'),
(2074,8,'2017-11-17'),
(2074,9,'2017-12-16'),
(2074,10,'2018-01-15'),
(2074,11,'2018-02-13'),
(2074,12,'2018-03-15'),
(2075,1,'2018-04-14'),
(2075,2,'2018-05-15'),
(2075,3,'2018-06-15'),
(2075,4,'2018-07-17'),
(2075,5,'2018-08-17'),
(2075,6,'2018-09-17'),
(2075,7,'2018-10-18'),
(2075,8,'2018-11-17'),
(2075,9,'2018-12-16'),
(2075,10,'2019-01-15'),
(2075,11,'2019-02-13'),
(2075,12,'2019-03-15'),
(2076,1,'2019-04-14'),
(2076,2,'2019-05-15'),
(2076,3,'2019-06-16'),
(2076,4,'2019-07-17'),
(2076,5,'2019-08-18'),
(2076,6,'2019-09-18'),
(2076,7,'2019-10-18'),
(2076,8,'2019-11-17'),
(2076,9,'2019-12-17'),
(2076,10,'2020-01-15'),
(2076,11,'2020-02-13'),
(2076,12,'2020-03-14'),
(2077,1,'2020-04-13'),
(2077,2,'2020-05-14'),
(2077,3,'2020-06-15'),
(2077,4,'2020-07-16'),
(2077,5,'2020-08-17'),
(2077,6,'2020-09-17'),
(2077,7,'2020-10-17'),
(2077,8,'2020-11-16'),
(2077,9,'2020-12-16'),
(2077,10,'2021-01-14'),
(2077,11,'2021-02-13'),
(2077,12,'2021-03-14'),
(2078,1,'2021-04-14'),
(2078,2,'2021-05-15'),
(2078,3,'2021-06-15'),
(2078,4,'2021-07-16'),
(2078,5,'2021-08-17'),
(2078,6,'2021-09-17'),
(2078,7,'2021-10-18'),
(2078,8,'2021-11-17'),
(2078,9,'2021-12-16'),
(2078,10,'2022-01-15'),
(2078,11,'2022-02-13'),
(2078,12,'2022-03-15'),
(2079,1,'2022-04-14'),
(2079,2,'2022-05-15'),
(2079,3,'2022-06-15'),
(2079,4,'2022-07-17'),
(2079,5,'2022-08-17'),
(2079,6,'2022-09-17'),
(2079,7,'2022-10-18'),
(2079,8,'2022-11-17'),
(2079,9,'2022-12-16'),
(2079,10,'2023-01-15'),
(2079,11,'2023-02-13'),
(2079,12,'2023-03-15'),
(2080,1,'2023-04-14'),
(2080,2,'2023-05-15'),
(2080,3,'2023-06-16'),
(2080,4,'2023-07-17'),
(2080,5,'2023-08-18'),
(2080,6,'2023-09-18'),
(2080,7,'2023-10-18'),
(2080,8,'2023-11-17'),
(2080,9,'2023-12-17'),
(2080,10,'2024-01-15'),
(2080,11,'2024-02-13'),
(2080,12,'2024-03-14'),
(2081,1,'2024-04-13'),
(2081,2,'2024-05-14'),
(2081,3,'2024-06-15'),
(2081,4,'2024-07-16'),
(2081,5,'2024-08-17'),
(2081,6,'2024-09-17'),
(2081,7,'2024-10-17'),
(2081,8,'2024-11-16'),
(2081,9,'2024-12-16'),
(2081,10,'2025-01-14'),
(2081,11,'2025-02-13'),
(2081,12,'2025-03-14'),
(2082,1,'2025-04-14'),
(2082,2,'2025-05-15'),
(2082,3,'2025-06-15'),
(2082,4,'2025-07-17'),
(2082,5,'2025-08-17'),
(2082,6,'2025-09-17'),
(2082,7,'2025-10-18'),
(2082,8,'2025-11-17'),
(2082,9,'2025-12-16'),
(2082,10,'2026-01-15'),
(2082,11,'2026-02-13'),
(2082,12,'2026-03-15'),
(2083,1,'2026-04-14'),
(2083,2,'2026-05-15'),
(2083,3,'2026-06-15'),
(2083,4,'2026-07-17'),
(2083,5,'2026-08-17'),
(2083,6,'2026-09-17'),
(2083,7,'2026-10-18'),
(2083,8,'2026-11-17'),
(2083,9,'2026-12-16'),
(2083,10,'2027-01-15'),
(2083,11,'2027-02-13'),
(2083,12,'2027-03-15'),
(2084,1,'2027-04-14'),
(2084,2,'2027-05-15'),
(2084,3,'2027-06-16'),
(2084,4,'2027-07-17'),
(2084,5,'2027-08-18'),
(2084,6,'2027-09-18'),
(2084,7,'2027-10-18'),
(2084,8,'2027-11-17'),
(2084,9,'2027-12-17'),
(2084,10,'2028-01-15'),
(2084,11,'2028-02-13'),
(2084,12,'2028-03-14'),
(2085,1,'2028-04-14'),
(2085,2,'2028-05-14'),
(2085,3,'2028-06-15'),
(2085,4,'2028-07-16'),
(2085,5,'2028-08-17'),
(2085,6,'2028-09-17'),
(2085,7,'2028-10-17'),
(2085,8,'2028-11-16'),
(2085,9,'2028-12-16'),
(2085,10,'2029-01-14'),
(2085,11,'2029-02-13'),
(2085,12,'2029-03-14'),
(2086,1,'2029-04-14'),
(2086,2,'2029-05-15'),
(2086,3,'2029-06-15'),
(2086,4,'2029-07-17'),
(2086,5,'2029-08-17'),
(2086,6,'2029-09-17'),
(2086,7,'2029-10-18'),
(2086,8,'2029-11-17'),
(2086,9,'2029-12-16'),
(2086,10,'2030-01-15'),
(2086,11,'2030-02-13'),
(2086,12,'2030-03-15'),
(2087,1,'2030-04-14'),
(2087,2,'2030-05-15'),
(2087,3,'2030-06-15'),
(2087,4,'2030-07-17'),
(2087,5,'2030-08-17'),
(2087,6,'2030-09-17'),
(2087,7,'2030-10-18'),
(2087,8,'2030-11-17'),
(2087,9,'2030-12-17'),
(2087,10,'2031-01-15'),
(2087,11,'2031-02-14'),
(2087,12,'2031-03-16'),
(2088,1,'2031-04-15'),
(2088,2,'2031-05-15'),
(2088,3,'2031-06-15'),
(2088,4,'2031-07-17'),
(2088,5,'2031-08-18'),
(2088,6,'2031-09-17'),
(2088,7,'2031-10-18'),
(2088,8,'2031-11-17'),
(2088,9,'2031-12-17'),
(2088,10,'2032-01-15'),
(2088,11,'2032-02-14'),
(2088,12,'2032-03-15'),
(2089,1,'2032-04-14'),
(2089,2,'2032-05-14'),
(2089,3,'2032-06-15'),
(2089,4,'2032-07-16'),
(2089,5,'2032-08-17'),
(2089,6,'2032-09-17'),
(2089,7,'2032-10-17'),
(2089,8,'2032-11-16'),
(2089,9,'2032-12-16'),
(2089,10,'2033-01-14'),
(2089,11,'2033-02-13'),
(2089,12,'2033-03-15')
on conflict do nothing;
revoke all on public.archive_nepali_months from public,anon,authenticated;
create table if not exists public.archive_daily (
 business_date date primary key, record_count integer not null, gaming_minutes numeric not null, discounts numeric not null, cash numeric not null, bank numeric not null, gross numeric not null, food_total numeric not null, time_revenue numeric not null, food jsonb not null default '[]'
);
alter table public.archive_daily add column if not exists paid_count integer not null default 0;
create table if not exists public.loyalty_carryforward (
 phone text primary key, customer_name text not null, stamps bigint not null default 0, played_seconds bigint not null default 0, visits bigint not null default 0
);
create table if not exists public.archive_history (id uuid primary key, cutoff date not null, staff_name text not null, archive_filename text not null, snapshot_hash text not null, removed jsonb not null, created_at timestamptz not null default now());
create table if not exists public.archive_jobs (id uuid primary key default gen_random_uuid(),staff_id uuid not null,cutoff date not null,snapshot_hash text not null,session_ids uuid[] not null,created_at timestamptz not null default now(),downloaded_at timestamptz,filename text,completed_at timestamptz);
create table if not exists public.archive_cleanup_guard (pid integer primary key,transaction_id bigint not null);
revoke all on public.archive_jobs,public.archive_cleanup_guard from public,anon,authenticated;
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
 'tournament_players',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.tournament_players x),
 'tournament_matches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.tournament_matches x),
 'waiting_list',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.waiting_list x),
 'inventory_session_stock',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.inventory_session_stock x),
 'food_partner_bill_revisions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.food_partner_bill_revisions x),
 'archive_daily',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.archive_daily x),
 'loyalty_carryforward',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.loyalty_carryforward x),
 'archive_history',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.archive_history x),
 'accounting_source_state',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.accounting_source_state x)
 );
end $$;
-- Stable ordering prevents a physical scan-order change invalidating a saved archive.
create or replace function public.archive_fingerprint(p_data jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
 select md5(jsonb_object_agg(key,case when jsonb_typeof(value)='array' then (select coalesce(jsonb_agg(x order by x::text),'[]') from jsonb_array_elements(value) x) else value end)::text) from jsonb_each(p_data)
$$;
create or replace function public.archive_is_cleanup() returns boolean language sql security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.archive_cleanup_guard where pid=pg_backend_pid() and transaction_id=txid_current())
$$;
-- Preserve ordinary deletion behavior; only this private transaction guard bypasses reversal.
do $$ declare f text;def text;begin
 foreach f in array array['inventory_track_session','loyalty_capture','accounting_capture'] loop
  select pg_get_functiondef(to_regprocedure('public.'||f||'()')) into def;
  if def is null then raise exception 'Apply inventory, accounting and loyalty migrations first.';end if;
  if strpos(def,'public.archive_is_cleanup()')=0 then
   def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n if TG_OP=''DELETE'' and public.archive_is_cleanup() then return OLD;end if;','i');
   execute def;
  end if;
 end loop;
end $$;
create or replace function public.loyalty_balance(p_phone text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with s as(select coalesce(sum(stamps),0)::bigint stamps,coalesce(sum(played_seconds),0)::bigint seconds from (select stamps,played_seconds from public.loyalty_visits where phone=public.loyalty_phone(p_phone) union all select stamps,played_seconds from public.loyalty_carryforward where phone=public.loyalty_phone(p_phone)) v),r as(select count(*)::bigint redeemed from public.loyalty_rewards where phone=public.loyalty_phone(p_phone) and voided_at is null)
 select jsonb_build_object('stamps',stamps,'played_seconds',seconds,'redeemed',redeemed,'available',greatest(0,floor(stamps/10.0)::bigint-redeemed),'progress',greatest(0,stamps-redeemed*10)%10,'deficit',greatest(0,redeemed*10-stamps)) from s,r
$$;
create or replace function public.archive_prepare(p_staff_id uuid,p_cutoff date) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare data jsonb;ids uuid[];job uuid;fingerprint text;begin
 if not exists(select 1 from public.staff where id=p_staff_id and active and role='admin') then raise exception 'An active admin is required.';end if;
 if p_cutoff is null or not exists(select 1 from public.archive_nepali_months where start_date>(now() at time zone 'Asia/Kathmandu')::date) or p_cutoff >= (select max(start_date) from public.archive_nepali_months where start_date<=(now() at time zone 'Asia/Kathmandu')::date) then raise exception 'Choose a completed period before the current Nepali month.';end if;
 data:=public.accounting_statement_data(p_staff_id);
 select coalesce(array_agg((r->>'id')::uuid),'{}') into ids from jsonb_array_elements(data->'sessions') r
 where (coalesce((r->>'start_time')::timestamptz,(r->>'created_at')::timestamptz) at time zone 'Asia/Kathmandu')::date<=p_cutoff
 and coalesce((r->>'end_time')::timestamptz,(r->>'start_time')::timestamptz)<((p_cutoff+1)::timestamp at time zone 'Asia/Kathmandu')
 and r->>'status' in ('Completed','Cancelled')
 and (r->>'status'='Cancelled' or coalesce((r->>'paid')::boolean,false) or coalesce((r->>'amount')::numeric,0)=0 or coalesce(r->>'notes','') like '%[Payment: Waived%')
 and coalesce((public.accounting_session_postings(r)->>'receivables')::numeric,0)=0
 and (r->>'status'='Cancelled' or (coalesce((r->>'due_amount')::numeric,0)=0 and coalesce(r->>'notes','') !~* '\[Payment:\s*(Unpaid|Partial)'));
 fingerprint:=public.archive_fingerprint(data);
 delete from public.archive_jobs where completed_at is null and created_at<now()-interval '2 days';
 insert into public.archive_jobs(staff_id,cutoff,snapshot_hash,session_ids) values(p_staff_id,p_cutoff,fingerprint,ids) returning id into job;
 return jsonb_build_object('job_id',job,'cutoff',p_cutoff,'snapshot_hash',fingerprint,'session_ids',to_jsonb(ids),'data',data);
end $$;
create or replace function public.archive_download_saved(p_staff_id uuid,p_job uuid,p_hash text,p_filename text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.staff where id=p_staff_id and active and role='admin') then raise exception 'An active admin is required.';end if;
 update public.archive_jobs set downloaded_at=now(),filename=left(p_filename,250) where id=p_job and staff_id=p_staff_id and snapshot_hash=p_hash and completed_at is null and created_at>now()-interval '2 hours' and length(trim(p_filename))>0;
 if not found then raise exception 'Prepare and save a fresh archive first.';end if;
end $$;
create or replace function public.archive_erase(p_staff_id uuid,p_job uuid,p_hash text,p_confirmation text,p_daily jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.archive_jobs;actor text;data jsonb;counts jsonb;session_count integer;movement_count integer;waiting_count integer;row_data jsonb;existing_food jsonb;journal_day date;journal_id uuid;journal_totals jsonb;old_entries uuid[];journal_count integer;begin
 select name into actor from public.staff where id=p_staff_id and active and role='admin';if not found then raise exception 'An active admin is required.';end if;
 if p_confirmation is distinct from 'CONFIRM' then raise exception 'Type CONFIRM exactly to erase archived details.';end if;
 perform pg_advisory_xact_lock(hashtextextended('chillpill:archive',0));
 select * into job from public.archive_jobs where id=p_job and staff_id=p_staff_id for update;
 if not found then raise exception 'Prepare and download an archive first.';end if;
 if job.completed_at is not null then return (select removed from public.archive_history where id=job.id);end if;
 if job.downloaded_at is null or job.snapshot_hash is distinct from p_hash or job.created_at<now()-interval '2 hours' then raise exception 'Prepare and save a fresh archive first.';end if;
 -- Block writes during final validation and deletion. Reads remain available.
 lock table public.sessions,public.menu_items,public.expenses,public.accounting_settings,public.accounting_entries,public.accounting_lines,public.accounting_balance_checks,public.accounting_expense_payments,public.capital_contributions,public.accounting_transactions,public.accounting_partners,public.accounting_corrections,public.loyalty_visits,public.loyalty_rewards,public.food_partner_bills,public.food_partner_payments,public.inventory_items,public.inventory_movements,public.tournaments,public.tournament_players,public.tournament_matches,public.waiting_list,public.inventory_session_stock,public.food_partner_bill_revisions,public.archive_daily,public.loyalty_carryforward,public.archive_history,public.accounting_source_state in share row exclusive mode;
 data:=public.accounting_statement_data(p_staff_id);
 if public.archive_fingerprint(data)<>job.snapshot_hash then raise exception 'Records changed after this archive was prepared. Download a fresh archive before cleanup.';end if;
 if exists(select 1 from unnest(array['inventory_track_session','loyalty_capture','accounting_capture'])f where coalesce(strpos(pg_get_functiondef(to_regprocedure('public.'||f||'()')),'public.archive_is_cleanup()'),0)=0) then raise exception 'Archive safeguards were replaced by an older migration. Reapply supabase/migrations/20261117_record_archives.sql before cleanup.';end if;
 if jsonb_typeof(p_daily) is distinct from 'array' then raise exception 'Daily summaries are required.';end if;
 -- Validate every day's visit count and invoice total against the locked source records.
 if exists(
  with expected as(select (coalesce(start_time,created_at) at time zone 'Asia/Kathmandu')::date d,count(*) c,round(sum(-coalesce((public.accounting_session_postings(to_jsonb(s))->>'sales_income')::numeric,0)),2) gross from public.sessions s where id=any(job.session_ids) group by 1),
  supplied as(select (r->>'business_date')::date d,(r->>'record_count')::bigint c,(r->>'gross')::numeric gross from jsonb_array_elements(p_daily) r)
  select 1 from expected e full join supplied s on s.d=e.d where e.d is null or s.d is null or e.c<>s.c or e.gross<>s.gross
 ) or (select count(*) from jsonb_array_elements(p_daily))<>(select count(distinct r->>'business_date') from jsonb_array_elements(p_daily) r) then raise exception 'Summary totals do not match the archived records. Refresh and retry.';end if;
 if exists(select 1 from jsonb_array_elements(p_daily) r where (r->>'gross')::numeric<0 or (r->>'food_total')::numeric<0 or (r->>'time_revenue')::numeric<0 or (r->>'cash')::numeric<0 or (r->>'bank')::numeric<0 or abs((r->>'gross')::numeric-(r->>'food_total')::numeric-(r->>'time_revenue')::numeric)>0.01 or abs((r->>'gross')::numeric-(r->>'cash')::numeric-(r->>'bank')::numeric)>0.01 or abs((r->>'food_total')::numeric-(select coalesce(sum((f->>'collected')::numeric),0) from jsonb_array_elements(r->'food')f))>0.01) then raise exception 'Summary payment and food totals are inconsistent. Correct the source records before cleanup.';end if;
 insert into public.loyalty_carryforward(phone,customer_name,stamps,played_seconds,visits)
 select phone,(array_agg(customer_name order by visited_at desc))[1],sum(stamps),sum(played_seconds),count(*) from public.loyalty_visits where session_id=any(job.session_ids) group by phone
 on conflict(phone) do update set customer_name=excluded.customer_name,stamps=loyalty_carryforward.stamps+excluded.stamps,played_seconds=loyalty_carryforward.played_seconds+excluded.played_seconds,visits=loyalty_carryforward.visits+excluded.visits;
 for row_data in select * from jsonb_array_elements(p_daily) loop
  insert into public.archive_daily(business_date,record_count,gaming_minutes,discounts,cash,bank,gross,food_total,time_revenue,food,paid_count)
  values((row_data->>'business_date')::date,(row_data->>'record_count')::int,(row_data->>'gaming_minutes')::numeric,(row_data->>'discounts')::numeric,(row_data->>'cash')::numeric,(row_data->>'bank')::numeric,(row_data->>'gross')::numeric,(row_data->>'food_total')::numeric,(row_data->>'time_revenue')::numeric,row_data->'food',coalesce((row_data->>'paid_count')::int,(row_data->>'record_count')::int))
  on conflict(business_date) do update set paid_count=archive_daily.paid_count+excluded.paid_count,record_count=archive_daily.record_count+excluded.record_count,gaming_minutes=archive_daily.gaming_minutes+excluded.gaming_minutes,discounts=archive_daily.discounts+excluded.discounts,cash=archive_daily.cash+excluded.cash,bank=archive_daily.bank+excluded.bank,gross=archive_daily.gross+excluded.gross,food_total=archive_daily.food_total+excluded.food_total,time_revenue=archive_daily.time_revenue+excluded.time_revenue,food=archive_daily.food||excluded.food;
  select coalesce(jsonb_agg(t),'[]') into existing_food from(select f->>'source' source,sum((f->>'ordered')::numeric) ordered,sum((f->>'collected')::numeric) collected,sum((f->>'qty')::numeric) qty,sum((f->>'menu_value')::numeric) menu_value from public.archive_daily a cross join lateral jsonb_array_elements(a.food) f where business_date=(row_data->>'business_date')::date group by 1)t;
  update public.archive_daily set food=existing_food where business_date=(row_data->>'business_date')::date;
 end loop;
 insert into public.archive_cleanup_guard values(pg_backend_pid(),txid_current());
 -- Rewards remain redeemed; remove bulky checkout payloads only after the full export.
 update public.loyalty_rewards set checkout_payload=null where session_id=any(job.session_ids);
 delete from public.sessions where id=any(job.session_ids);get diagnostics session_count=row_count;
 delete from public.inventory_movements m where (created_at at time zone 'Asia/Kathmandu')::date<=job.cutoff and (session_id is null or not exists(select 1 from public.sessions s where s.id=m.session_id));get diagnostics movement_count=row_count;
 delete from public.waiting_list where status in ('Seated','Cancelled') and (created_at at time zone 'Asia/Kathmandu')::date<=job.cutoff;get diagnostics waiting_count=row_count;
 -- Replace detailed settled-session journals with equal daily debits and credits.
 select coalesce(array_agg(id),'{}') into old_entries from public.accounting_entries where source_type='sessions' and source_id=any(array(select x::text from unnest(job.session_ids)x));
 journal_count:=cardinality(old_entries);
 for journal_day in select distinct business_date from public.accounting_entries where id=any(old_entries) loop
  select id into journal_id from public.accounting_entries where source_type='archive_sessions' and source_id=journal_day::text;
  select coalesce(jsonb_agg(t),'[]') into journal_totals from(
   select l.account,l.party,sum(l.debit) debit,sum(l.credit) credit from public.accounting_lines l join public.accounting_entries e on e.id=l.entry_id
   where e.business_date=journal_day and (e.id=any(old_entries) or e.id=journal_id) group by l.account,l.party
  )t;
  if journal_id is null then
   insert into public.accounting_entries(source_type,source_id,description,business_date) values('archive_sessions',journal_day::text,'Archived settled-session daily totals',journal_day) returning id into journal_id;
  else delete from public.accounting_lines where entry_id=journal_id;end if;
  insert into public.accounting_lines(entry_id,account,party,debit,credit)
  select journal_id,t->>'account',t->>'party',(t->>'debit')::numeric,0 from jsonb_array_elements(journal_totals)t where (t->>'debit')::numeric>0
  union all select journal_id,t->>'account',t->>'party',0,(t->>'credit')::numeric from jsonb_array_elements(journal_totals)t where (t->>'credit')::numeric>0;
 end loop;
 delete from public.accounting_lines where entry_id=any(old_entries);
 delete from public.accounting_entries where id=any(old_entries);
 delete from public.accounting_source_state where source_type='sessions' and source_id=any(array(select x::text from unnest(job.session_ids)x));
 delete from public.archive_cleanup_guard where pid=pg_backend_pid();
 counts:=jsonb_build_object('sessions',session_count,'inventory_movements',movement_count,'waiting_entries',waiting_count,'journal_entries_compacted',journal_count);
 insert into public.archive_history(id,cutoff,staff_name,archive_filename,snapshot_hash,removed) values(job.id,job.cutoff,actor,job.filename,job.snapshot_hash,counts);
 update public.archive_jobs set completed_at=now(),session_ids='{}' where id=job.id;
 return counts;
end $$;
do $$ declare t text;begin
 foreach t in array array['archive_daily','loyalty_carryforward','archive_history'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists archive_read on public.%I',t);
  execute format('create policy archive_read on public.%I for select to anon,authenticated using(true)',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to anon,authenticated',t);
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;
end $$;
revoke all on function public.archive_fingerprint(jsonb),public.archive_is_cleanup(),public.archive_prepare(uuid,date),public.archive_download_saved(uuid,uuid,text,text),public.archive_erase(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_prepare(uuid,date),public.archive_download_saved(uuid,uuid,text,text),public.archive_erase(uuid,uuid,text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
