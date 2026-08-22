# ChillPill Gaming Cafe — website + owner console

A two-page project for a hourly-PlayStation gaming cafe:

- **`index.html`** — the public website (info, ambience, games, pricing, food menu, contact/map, WhatsApp booking button). No online booking form — customers message you on WhatsApp and you confirm manually. Cafe name, hours, pricing text, WhatsApp number, and the food menu are all editable live from the dashboard, no code changes needed.
- **`dashboard.html`** — the owner console: a sidebar organizing Overview, Bookings, New Session, Billing, Records, and (admin-only) Revenue, Menu & Pricing, Cafe Content, and Staff. Backed by Supabase so it works from any device/browser and multiple staff see the same live data in real time. Served at two URLs — `/admin` (password only) and `/staff` (username + password) — see "Staff logins & roles" below.

Plain HTML/CSS/JS — no framework. There's a small build step (`npm run build`) with two jobs: keep your real Supabase keys and WhatsApp number **out of git entirely** (`scripts/generate-config.js`, see step 2), and generate the `/admin` and `/staff` pages as copies of `dashboard.html` (`scripts/sync-console-pages.js`, see "Staff logins & roles").

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up / log in → **New project**.
2. Pick a name (e.g. `chillpill-gaming-cafe`), a database password (save it somewhere), and a region close to Nepal (e.g. Singapore).
3. Wait ~2 minutes for it to finish provisioning.
4. Open **SQL Editor** (left sidebar) → **New query** → paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   - This creates the `sessions`, `menu_items`, `settings`, and `staff` tables, turns on Row Level Security, enables realtime sync, and seeds one starter login (see the "Staff logins" section below).
   - If you re-run it later, it's safe — it uses `if not exists` / `on conflict` guards and won't touch data that's already there.
5. Go to **Project Settings → API**. Copy:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

If you already ran an older version of this schema (before staff logins/billing existed), just re-run the current `schema.sql` — every new column and table is added with `if not exists` guards, so your existing sessions and menu are untouched.

## 2. Fill in your config

Real values (Supabase keys, WhatsApp number) are **never committed to git**. They're layered on top of the tracked `assets/js/config.js` defaults by a small override file, `assets/js/config.local.js` — which is gitignored — so the repo stays safe to make public later even though it currently has your real values applied locally.

**For local testing on your own computer:**

1. Copy [`assets/js/config.local.example.js`](assets/js/config.local.example.js) to `assets/js/config.local.js` (same folder).
2. Fill in the real values in that new file. It's already gitignored, so `git status` won't even show it.

**For the live Vercel deployment**, don't edit any file at all — instead set these as **Environment Variables** in Vercel (Project → Settings → Environment Variables), and the build step (`scripts/generate-config.js`, wired up in `vercel.json`) turns them into `config.local.js` automatically on every deploy:

| Environment variable | What to put |
|---|---|
| `SUPABASE_URL` | Your Project URL from step 1 |
| `SUPABASE_ANON_KEY` | Your anon public key from step 1 |
| `WHATSAPP_NUMBER` | Your WhatsApp number, country code + digits only, e.g. `9779812345678` |
| `CAFE_NAME`, `CAFE_TAGLINE`, `CAFE_LOCATION`, `CAFE_ADDRESS_LINE`, `OPENING_HOURS`, `WHATSAPP_DEFAULT_MESSAGE`, `DEFAULT_HOURLY_RATE`, `ALERT_MINUTES_BEFORE_END` | Optional first-load fallbacks only — once Supabase is connected, the **Cafe Content** tab in the dashboard is the real, live-editable source of truth for all of these except `DEFAULT_HOURLY_RATE` (set from **Menu & Pricing**) |

There's no `DASHBOARD_PASSWORD` anymore — staff sign in with their own username/password instead (see below).

After adding/changing env vars in Vercel, trigger a redeploy for them to take effect.

Everything else that isn't staff-editable (game list, ambience section layout) lives directly in `index.html` as plain text/HTML — search for the section (`<section id="games">`, etc.) and edit it like a normal web page.

## 3. Add real photos (optional but recommended)

The "ambience" and hero sections currently show dashed placeholder boxes. To swap them for real photos:

1. Drop your image files into `assets/images/`.
2. In `index.html`, find the `placeholder-art` `<div>`s and replace them with `<img src="assets/images/your-photo.jpg" class="rounded-2xl aspect-square object-cover" alt="...">`.

## 4. Run it locally

No server needed — but browsers restrict some things when opening `file://` directly, so serve it locally instead:

```bash
npx serve .
```

Then open the printed `http://localhost:...` URL. (Make sure you've created `assets/js/config.local.js` per step 2 first, otherwise you'll see placeholder values and a "Supabase not configured" notice.)

Run `npm run build` at least once first (see step 5) — it generates `admin.html` and `staff.html` as copies of `dashboard.html`, which is how `/admin` and `/staff` work both locally and on Vercel. `npx serve` auto-cleans `.html` URLs the same way Vercel does, so `http://localhost:.../admin.html` behaves the same as the real `/admin` URL.

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo (or drag-and-drop deploy from the Vercel dashboard).
2. In Vercel: **Add New Project** → import the repo → framework preset **"Other"** → **Deploy**. Vercel will auto-detect `vercel.json`'s `buildCommand` (`npm run build`), which runs `scripts/generate-config.js` and `scripts/sync-console-pages.js`.
3. **Before or right after** the first deploy, add the Environment Variables from step 2 (Project → Settings → Environment Variables), then redeploy so they take effect.
4. Your site will be live at `your-project.vercel.app`. The owner console has two URLs (see "Staff logins & roles" below for the difference): **`/admin`** and **`/staff`** — both kept out of search engines via `vercel.json`. (`/dashboard` and `/dashboard.html` still work too, defaulting to the staff-style login, for anyone with the old link.)
5. Point your own domain at it later from the Vercel project's **Domains** tab, if you have one.

---

## Staff logins & roles

There's no single shared dashboard password anymore — each staff member signs in with their own username and password, and every session/order they create is stamped with their name. The admin login is the one exception, kept deliberately simple like the original single-password setup.

**Two separate sign-in pages:**

- **`/admin`** — password only, no username. It checks the password against every active admin account and signs you in as whichever one matches. This is the quick, original-style login for the owner.
- **`/staff`** — username + password, for everyone else. Regular staff accounts only work here (an admin *can* also sign in this way with their username if they want, but doesn't need to).

Both pages run the identical `dashboard.js` — which login form you get is decided at runtime by reading the URL. Under the hood, `/admin` and `/staff` are served from real files, `admin.html` and `staff.html`, which are byte-for-byte copies of `dashboard.html` — `npm run build` regenerates them automatically (via `scripts/sync-console-pages.js`) as part of every deploy, and Vercel's `cleanUrls` setting serves `admin.html` at `/admin` the same way it already serves `dashboard.html` at `/dashboard`. (We initially tried this with a `vercel.json` rewrite instead of real files, which turned out not to be reliably applied by Vercel for this project — real files sidestep that entirely.) **If you ever hand-edit `dashboard.html` directly**, run `npm run sync-console-pages` afterward (or just `npm run build`) and commit the updated `admin.html`/`staff.html` too, or the three pages will drift out of sync.

- **First login:** `schema.sql` seeds one starter account — username `admin`, password `ChangeMe123!`. Sign in at `/admin` with just that password, then **change it immediately**: Staff tab → find "Admin" → **Reset pw**. That generates a new random password and shows it once — write it down, that's your real password now. (If you'd rather pick your own memorable one, create a second admin account with the password you want, sign in as that one via `/admin`, then deactivate the original `admin` account.) Either way, don't leave `ChangeMe123!` active.
- **Two roles:**
  - **Admin** — sees everything, including Revenue, Menu & Pricing, Cafe Content, and Staff.
  - **Staff** — sees Overview, Bookings, New Session, Billing, and Records (all staff share the same records — nothing is hidden between staff members), but not the admin-only sections. Only admins can delete a record.
- **Adding staff:** Staff tab → "Add staff account" → give them a name, username, and a temporary password, tell them directly (there's no email step) along with the `/staff` link. They should ideally change it themselves later via an admin-issued **Reset pw**.
- **Attribution:** every session created shows "👤 staff name" on its card, and the Revenue tab breaks down takings per staff member.
- **If you create a second (or third) admin account:** the `/admin` password-only login matches against *any* active admin, so if two admins happen to pick the same password, either one's password unlocks both identities (whichever is checked first). Give each admin a distinct password to avoid that ambiguity.

**Security note on this login system:** passwords are hashed (SHA-256 + a random salt per account) before they're ever sent to Supabase, so the database never stores plain text. That said, this is still a UI-level login, not full production-grade auth — see the "Security note" section further down for the honest limitations of a backend-less static site, and don't use this for anything beyond a small single-location team.

## Editing an active or booked session

Click **Edit** on any Active or Booked session card (Overview, Bookings, Billing, or Records) to open a full editor — station/table, which game(s) they're playing, customer name/phone, start time, duration, hourly rate, the entire food/drinks order (change quantities or remove items, not just add more), and staff notes. Saving recalculates the bill from scratch and re-arms the 5-minute alert. This is intentionally only available for Active/Booked sessions — once a session is Completed (paid via Checkout), it's locked as a record of what was actually charged.

## Billing & revenue

1. Start a session from **New Session** — station, customer, time, and any food/drinks ordered. Save it.
2. While it's running, extend it (**+15 min**) or open **Edit** to add/change food, adjust the time, or fix any other detail — see "Editing an active or booked session" below.
3. When the customer's ready to leave, hit **Checkout** on the session card (visible on Overview, Billing, or Records) — a summary pops up with the time cost + food breakdown and the total due.
4. Pick **Cash** or **Online** — this finalizes the session as *Completed*, stamps `paid_at`, and records which payment method was used. That's the only way a session becomes Completed, so nothing gets marked paid without a payment method attached.
5. The **Billing** tab is just a live queue of every session still awaiting checkout, so a second staff member can pick up where another left off.
6. The **Revenue** tab (admin-only) totals everything: overall, cash vs online split with bars, today's total, and a per-staff breakdown — useful for reconciling a shift or spotting who's driving sales.

## Cafe content (CMS)

The admin-only **Cafe Content** tab edits the cafe's name, tagline, short location, full address, opening hours, WhatsApp number, and default WhatsApp message — these are stored in Supabase's `settings` table and the public website (`index.html`) reads them live on every page load, falling back to the placeholders in `assets/js/config.js` only if Supabase isn't reachable. **Menu & Pricing** (also admin-only) is the same idea for food/drink items and the default hourly rate. Change either and the public site updates without a redeploy — just a page refresh for visitors.

---

## How the time tracking & 5-minute alert works

- When you save a session as **Active** (or mark a **Booked** customer as arrived), the console stores a `start_time` and computes `end_time = start_time + duration`.
- Every active session card shows a live **"Ends in Xh Ym"** countdown. The card border turns amber when under the alert threshold, and red once it's overdue.
- Exactly **5 minutes before `end_time`** (configurable via `ALERT_MINUTES_BEFORE_END`), the owner console:
  - Plays a short beep and shows an in-app toast.
  - Sends a **browser notification** (if you click "Enable alerts" once and allow the permission prompt) — this fires even if the dashboard tab is in the background, as long as the browser/computer stays on.
  - Marks that session so it won't alert again for the same 5-minute warning.
- When the timer hits zero, it fires a second "Time's up!" alert.
- Use the **+15 min** button on an active card to extend a session on the spot (recalculates the bill and re-arms the alert), or **Checkout** to finalize billing and close it out (see "Billing & revenue" above).

Browser notifications only work while the dashboard is open in a tab (even backgrounded) on a device that's powered on — there's no SMS/push-to-phone in this version. If you want a phone alert regardless of whether the dashboard is open, that would need a small server-side add-on (e.g. a Supabase Edge Function + WhatsApp/SMS API) — let me know if you'd like that added later.

## Security note (please read)

This project uses only Supabase's public **anon key** — there's no Supabase Auth (real login-account system) under the hood, just a `staff` table the dashboard checks passwords against. That keeps setup simple (no servers to run), but it means:

- Staff logins are a **UI-level lock only**. They stop casual visitors from opening the console, and passwords are hashed (not stored in plain text), but this does **not** protect the underlying database — anyone who extracts your anon key and URL from the deployed JS could, in theory, read/write every table (including staff password hashes) directly via the Supabase API, bypassing the login screen entirely.
- This is a normal, common trade-off for a small single-location business tool, but don't store anything more sensitive than name/phone/order info in it (no payment details, no ID documents), and don't reuse a staff member's dashboard password anywhere else.
- If you later want real protection: switch to Supabase Auth and change the Row Level Security policies in `supabase/schema.sql` from `using (true)` to `using (auth.uid() is not null)`. Ask me and I can wire that up.
- Separately: your Supabase anon key and WhatsApp number never touch git (see step 2) — they only ever exist in Vercel's encrypted Environment Variables and in your own gitignored `config.local.js`. This means the repo itself stays safe to make public later even though the *deployed site* will always expose the anon key in its JS (that part is unavoidable for a backend-less static site, and is what the point above is about).

## Project structure

```
Gaming-Cafe/
├─ index.html                     # public website (reads live content + menu from Supabase)
├─ dashboard.html                 # owner console — source of truth; edit this one
├─ admin.html                     # generated copy of dashboard.html — serves /admin (password-only login)
├─ staff.html                     # generated copy of dashboard.html — serves /staff (username+password login)
├─ vercel.json                    # build command + clean URLs + noindex headers
├─ package.json                   # "build" script → generate-config.js + sync-console-pages.js
├─ scripts/
│  ├─ generate-config.js          # turns Vercel env vars into config.local.js at build time
│  └─ sync-console-pages.js       # copies dashboard.html → admin.html / staff.html
├─ assets/
│  ├─ js/
│  │  ├─ config.js                # tracked, public-safe fallback defaults (committed)
│  │  ├─ config.local.example.js  # template — copy to config.local.js for local dev (committed)
│  │  ├─ config.local.js          # ← your real values (gitignored, never committed)
│  │  ├─ supabaseClient.js        # builds the shared Supabase client
│  │  ├─ passwordHash.js          # SHA-256 + salt helper for staff login/creation
│  │  ├─ dashboard.js             # owner console logic (staff auth, sidebar, billing, CMS)
│  │  └─ site.js                  # public site logic (live content + menu)
│  ├─ css/                        # (styles are inline in each page; folder reserved for future use)
│  └─ images/                     # put your real photos here
└─ supabase/
   └─ schema.sql                  # run once in Supabase's SQL editor (safe to re-run/migrate)
```
