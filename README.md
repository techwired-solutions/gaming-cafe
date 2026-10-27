# ChillPill Gaming Cafe — website + owner console

A two-page project for a hourly-PlayStation gaming cafe:

- **`index.html`** — the public website (info, ambience, games, pricing, food menu, contact/map, WhatsApp booking button). No online booking form — customers message you on WhatsApp and you confirm manually. Cafe name, hours, pricing text, WhatsApp number, and the food menu are all editable live from the dashboard, no code changes needed.
- **`dashboard.html`** — the owner console: a sidebar organizing Overview, Bookings, Waiting list, New Session, Billing, Stations, Records, and (admin-only) Revenue, Menu & Pricing, Cafe Content, and Staff. Backed by Supabase so it works from any device/browser and multiple staff see the same live data in real time. Served at two URLs — `/admin` (password only) and `/staff` (username + password) — see "Staff logins & roles" below.

Plain HTML/CSS/JS — no framework. There's a small build step (`npm run build`) with two jobs: keep your real Supabase keys and WhatsApp number **out of git entirely** (`scripts/generate-config.js`, see step 2), and generate the `/admin` and `/staff` pages as copies of `dashboard.html` (`scripts/sync-console-pages.js`, see "Staff logins & roles").

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up / log in → **New project**.
2. Pick a name (e.g. `chillpill-gaming-cafe`), a database password (save it somewhere), and a region close to Nepal (e.g. Singapore).
3. Wait ~2 minutes for it to finish provisioning.
4. Open **SQL Editor** (left sidebar) → **New query** → paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   - This creates the `sessions`, `menu_items`, `settings`, `staff`, `stations`, `tables`, and `waiting_list` tables, turns on Row Level Security, enables realtime sync, and seeds one starter login (see the "Staff logins" section below).
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

## Waiting list (first come, first served)

For walk-ins when every station's busy:

1. **Waiting list** tab → add their name, phone, and (optionally) any food/drinks they want while they wait — it's the same order-pad UI as everywhere else, so quantities and totals work the same way.
2. They're queued in the order they were added (oldest first, numbered #1, #2, …), each card showing how long they've been waiting.
3. When a station frees up, hit **Start session** on their card — this carries their name, phone, and food order straight into **New Session**, already filled in. Staff just pick a station and hit Save. The waiting-list entry is automatically marked "Seated" the moment that session is actually saved (not the moment you click Start session, so nothing's lost if you change your mind on the way).
4. **Edit** lets you fix a phone number or add/remove food while they're still waiting; **Remove** takes them off the queue (e.g. they left, or a no-show).

## Station board & per-compartment pricing

Pricing is per compartment, not per player — a station's hourly rate is charged whether one or two people are playing in it. Each station has its own configurable rate, defaulting to **रु 300/hr for PS5** and **रु 250/hr for PS4** (typing "PS5" or "PS4" as a station's type auto-fills that default, still editable per station for e.g. a premium or discounted booth). Want a 2-player session? Add the **"Extra Joystick (2-Player)"** menu item (रु 50) to the order like any other food/drink line item — it's a Menu & Pricing item under the "Add-ons" category, so it bills through checkout the same way but is left out of the public website's Food & Drinks list.

The **Stations** tab shows every station and whether it's free right now — for answering "how long's the wait?" in person or on the phone. Occupied stations show who's on them, what they're playing, and a live countdown (turning red once overdue, same as everywhere else); free stations show "Available now" plus the next booking on that station if there is one. Each card also shows the station's type and hourly rate.

Admins additionally see a **Manage stations** panel on the same page to add, rename, deactivate, or delete stations, plus set each one's rate — click **Edit** on any station to change its name, type, or rate inline. Station names you add here appear as autocomplete suggestions on New Session and Edit (not a hard-locked dropdown — an ad-hoc entry like "Counter" for a food-only order still works), which is what lets the board reliably match a running session to a station; typing a known station's exact name into New Session also auto-fills that station's configured rate.

## Waiting-room tables

Separate from the stations above, the **Waiting list** tab also has an admin-only **Manage tables** panel for the physical tables customers sit at while they wait — same add/edit/deactivate/delete pattern as stations. When staff add someone to the waiting list, they can optionally assign a table (autocomplete from this list, still free text so an ad-hoc spot works too); it shows on that customer's waiting card so staff can find and allocate by table at a glance, and stays on the record as a reference even after they're seated.

## Overtime billing

If a session runs past its end time, checkout now accounts for it automatically:

- **Within 5 minutes of the end time** (configurable via `OVERTIME_GRACE_MINUTES`) — no extra charge. Plenty of cafes let people wrap up naturally, and this avoids nickel-and-diming a customer who's back in 2 minutes.
- **Past that grace period** — the customer is charged for every minute since the original end time (not just the minutes past the grace window), at the session's hourly rate ÷ 60. A session overdue by 12 minutes with a 5-minute grace period bills all 12 minutes, not just 7.
- This shows up two places: as "(+रु X overtime)" right on the overdue session's countdown badge everywhere it appears (Overview, Billing, Records, the Station board), and as its own line item in the Checkout breakdown — along with any discount entered — recalculated fresh at the moment of payment (not frozen from whenever the checkout modal happened to be opened). The paid amount, `overtime_amount`, and `discount_amount` are all saved on the record.
- Extending a session (any number of minutes, via the box next to **+ Add min**) moves the end time forward and clears any accrued overtime — that's the right move if the customer's actually still playing past the original time.

## Editing an active or booked session

Click **Edit** on any Active or Booked session card (Overview, Bookings, Billing, or Records) to open a full editor — station/table, which game(s) they're playing, customer name/phone, start time, end time, duration, hourly rate, the entire food/drinks order (change quantities or remove items, not just add more), and staff notes. Start/end/duration stay in sync the same way they do on New Session, and the date shown is the record's own original date, not necessarily today. Saving recalculates the bill from scratch and re-arms the 5-minute alert.

Active sessions also get a **+ Food** button right next to Edit — a much smaller popup with just the food/drinks order (add items, change quantities, remove things) and nothing else, for the common case of "the customer just ordered another round" without wading through station/time/notes fields to get there.

This is intentionally only available for Active/Booked sessions — once a session is Completed (paid via Checkout), it's locked as a record of what was actually charged.

## Can't double-book a station

A station can't have two overlapping sessions — Active or Booked — at once. This is enforced everywhere a station and a time get chosen:

- **New Session**: typing (or picking from the list) a station that's currently Active hides "Active (playing now)" from the Current status dropdown entirely — only "Booked" is offered — with a note saying who's on it and when it frees up. Separately, whatever time window you're about to save (start time + duration, for *either* Active or Booked) is checked against every other Active/Booked session on that station — if it overlaps, saving is blocked with an error naming who's got it and from when to when. This catches two Booked reservations clashing, and also a walk-in Active session that would run into a booking already on the books for later.
- **Bookings tab**: "Mark active" refuses (with a toast explaining why) if activating it right now would overlap another Active or Booked session on that station.
- **Edit**: changing an Active or Booked session's station or time to overlap another Active/Booked session on that station is blocked the same way.

The one thing this doesn't cover: it only compares against sessions already in the system — if a customer calls to reserve a slot you haven't entered yet, there's obviously nothing to check against until it's entered.

## Billing & revenue

1. Start a session from **New Session** — station, customer, time, and any food/drinks ordered. Save it.
2. While it's running:
   - **+ Food** on the session card opens a small order-only popup — just the food/drinks list, nothing else — for the common case of "they ordered another round." **Edit** opens the full editor (station, time, game, notes, and food) for everything else.
   - Extend it by any number of minutes: type into the small box next to **+ Add min** (defaults to 15, but 5, 20, 60 — whatever the customer asks for — works the same way).
3. When the customer's ready to leave, hit **Checkout** — a summary pops up with the time cost + food breakdown and the total due. See "Discounts" below for how to apply one.
4. Pick **Cash** or **Online** — this finalizes the session as *Completed*, stamps `paid_at`, and records the payment method (plus any discount and overtime). That's the only way a session becomes Completed, so nothing gets marked paid without a payment method attached.
5. The **Billing** tab is just a live queue of every session still awaiting checkout, so a second staff member can pick up where another left off.
6. The **Revenue** tab (admin-only) totals everything: overall, cash vs online split with bars, today's total, total discounts given, and a per-staff breakdown — useful for reconciling a shift or spotting who's driving sales.

## Discounts

Checkout has three ways to give a discount, picked with the icon buttons above the discount field — **they only ever apply to the play-time charge (duration × rate), never to food/drinks or the overtime charge**:

- **Percent** — e.g. 10%, 15%. Capped at **20%** — typing more just clamps back down to 20 as you type.
- **Amount (रु)** — a flat rupee amount off the play-time charge specifically (not the whole bill). Also capped at 20% *of that play-time charge* — e.g. on a रु 600 time charge, the most you can take off is रु 120, even if food pushes the total bill higher. Typing more clamps down to the cap.
- **Minutes** — waives a number of minutes of play time outright (e.g. comp 30 minutes for a customer who played 120). No 20% cap here — the only limit is the session's actual duration, since you can't waive more time than was played.

Switching between the three resets the field to 0 so a value typed for one mode doesn't carry over and get misread in another. The breakdown and total update live as you type, and whichever mode was used — plus the exact percent/amount/minutes entered — is saved on the record (`discount_type`, `discount_value`, `discount_amount`) for the books.

## Cafe content (CMS)

The admin-only **Cafe Content** tab edits the cafe's name, tagline, short location, full address, opening hours, WhatsApp number, and default WhatsApp message — these are stored in Supabase's `settings` table and the public website (`index.html`) reads them live on every page load, falling back to the placeholders in `assets/js/config.js` only if Supabase isn't reachable. **Menu & Pricing** (also admin-only) is the same idea for food/drink items and the default hourly rate. Change either and the public site updates without a redeploy — just a page refresh for visitors.

---

## How the time tracking & 5-minute alert works

Sessions only ever run same-day (this is a walk-in cafe, not multi-day bookings), so **New Session** and **Edit** only ask for a time-of-day — no date picker. The date is filled in automatically and shown as a small read-only label next to "Time tracking": today's date when creating a session, or the record's own original date when editing an older one (so fixing a past record's time doesn't accidentally move it to today).

Start time, end time, and duration all stay in sync automatically — change any one of the three and the other two update to match:
- Start time defaults to right now when you open New Session.
- Change **Duration**, and **End time** recalculates.
- Change **End time**, and **Duration** recalculates.

The rest of the tracking behavior:
- Saving a session as **Active** (or marking a **Booked** customer as arrived) stores a `start_time` and computes `end_time = start_time + duration`.
- Every active session card shows a live **"Ends in Xh Ym"** countdown. The card border turns amber when under the alert threshold, and red once it's overdue.
- Exactly **5 minutes before `end_time`** (configurable via `ALERT_MINUTES_BEFORE_END`), the owner console:
  - Plays a short beep and shows an in-app toast.
  - Sends a **browser notification** (if you click "Enable alerts" once and allow the permission prompt) — this fires even if the dashboard tab is in the background, as long as the browser/computer stays on.
  - Marks that session so it won't alert again for the same 5-minute warning.
- When the timer hits zero, it fires a second "Time's up!" alert, and (see "Overtime billing" below) starts accruing an overtime charge after a grace period.
- Extend an active session by any number of minutes (type it into the box next to **+ Add min**, defaulting to 15), or **Checkout** to finalize billing and close it out (see "Billing & revenue" above).

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
## Native inventory

The **Inventory** sidebar page manages food, drinks, supplies, and gaming equipment in the cafe dashboard. Admins create/edit/archive items and set opening stock, unit costs, suppliers, reorder levels and optional menu links. Both admins and staff can restock, issue, return, record damage/wastage, and perform stocktakes. Equipment shows **available** and **issued** quantities; returning more equipment than was issued is rejected.

### Enable it on an existing Supabase project

1. Open Supabase **SQL Editor** for this cafe's project.
2. Run [`supabase/migrations/20261026_inventory.sql`](supabase/migrations/20261026_inventory.sql). It can be re-run safely and is also included in `supabase/schema.sql` for new projects.
3. Reload the dashboard, open **Inventory**, and add the actual stock currently on hand. The page includes a download/copy setup option until the migration has been run.

Existing LinkyPot inventory is **not imported or synchronized**. Enter opening stock from a physical count or your existing inventory records. Past food orders are not automatically deducted when you add a menu link. New linked orders deduct stock when saved, including food added to existing sessions. Quantity edits apply only the difference, so checkout, payment edits, and repeated saves do not deduct twice. Reducing/cancelling/deleting an order returns only stock previously deducted by this system. Insufficient stock rejects the entire order save without leaving a partial sale or stock change.

Menu-linked items can specify stock units per sale (e.g. 1 bottle). Leave the menu link empty for supplies and equipment. Issue equipment when it leaves storage and return it when available again; damaged equipment already issued should be returned before recording damage. Stocktake sets the actual **available** count and retains issued equipment separately. Restocking records stock/cost, but **does not add an expense**; record supplier payments in Expenses as usual. The displayed inventory value is the current available quantity multiplied by the current unit cost, not a full accounting valuation.

Search/filter stock, see low/out-of-stock warnings, export filtered stock to CSV, and view movement history by item. Archive items instead of deleting their history. Inventory follows this console's existing staff-ID login model; see the existing security note before exposing the anon-key application beyond trusted staff.

### Inventory verification

- `npm test` runs session regressions plus inventory KPI/filter and dashboard-wiring tests.
- `npm run test:inventory:db` runs PostgreSQL transaction and concurrency tests **only** against an isolated local database named `inventory_test` on `127.0.0.1:55439`, as user `inventory_test`. It never reads production credentials. Create that test database first; set `INVENTORY_TEST_PSQL` or `INVENTORY_TEST_PORT` if needed.
- Database tests cover repeated migrations, sale quantity changes, checkout idempotency, insufficient-stock rollback, cancellation/deletion returns, historical-order handling, equipment issue/return, audit balances and simultaneous use of the last stock unit.

## Food Sources & Partners: actual daily bills

The admin sidebar now has **Food Sources & Partners** directly below Revenue. This replaces percentage-based supplier earnings and the previous payout controls in Revenue. Menu import and restaurant WhatsApp contact settings are available on the new tab. Menu item prices remain editable in Menu & Pricing.

**Activation:** run [`supabase/migrations/20261026_food_partner_bills.sql`](supabase/migrations/20261026_food_partner_bills.sql) once in Supabase SQL Editor, then refresh. New projects also receive these tables/functions through `schema.sql`. This uses the console's existing staff-ID access model.

At the end of each day, choose the supplier and enter the actual discounted bill total/reference. For **2 teas × रु 40 = रु 80 collected**, a **रु 50 supplier bill** means **रु 30 cafe retained** and **रु 50 payable**. Record one or more payments against that bill; it becomes Paid when the balance reaches zero. New payments create one linked Partner Payout expense atomically. Revenue subtracts the supplier bill once; paying it does not subtract it again. Unbilled partner orders contribute no estimated profit until a bill is entered. A bill above collections produces a negative margin rather than hiding the loss. Bardali uses its actual bill, with no assumed percentage. ChillPill's own food shows customer collections before inventory/operating costs.

Orders are grouped by the session's **start date in Nepal time**, including unpaid/active orders for reconciliation. Actual recorded collections are apportioned between gaming/food and between food sources in proportion to the bill values; integer-paisa allocation preserves totals. A missing bill is labelled Awaiting Bill. Late order changes trigger a review warning against the ordered-value snapshot saved with the bill. References, bill edits, payment dates, and staff names are retained. The Overview card is labelled **Collected today (gross)** to distinguish cash collected from retained earnings.

Historical percentage settings and per-item cost overrides no longer determine reported partner earnings. Existing payout expenses remain intact and are listed separately until linked to a daily bill. A matching historical payout can be attached without creating another expense (one complete expense per payment). Unlinked old payouts are not silently matched by date or subtracted twice. The existing optional staff/owner customer-price discount remains a customer discount; it does not determine what the supplier is owed.

Payment requests are retry-safe, and row locks prevent simultaneous overpayment. Recorded payments protect their linked expense from direct editing/deletion. Use **Correct** in payment history to void an incorrect record with a reason; this retains the voided payment history and removes its expense. It is a bookkeeping correction and does not reverse cash or bank transfers. A bill cannot be reduced below its recorded payments.

`npm test` includes actual-bill accounting tests. `npm run test:food-partners:db` runs migrations, payment/expense integrity, retry, correction, historical linking, and concurrent-overpayment tests on the isolated local `inventory_schema_test` database (full `schema.sql` installed), at `127.0.0.1:55439`, user `inventory_test`. No production credentials are used.

### Food rate comparisons and record deletion

The Food Sources table compares the saved menu/listed unit rate with the customer-charged unit rate, rate difference, menu value, charged line total, and actual allocated collection. New menu orders save `menu_price` inside `food_items`; edit/quick-food/waiting flows preserve it. Historical orders without that snapshot show the **current menu** as a labelled reference, or the customer-charged rate when no menu reference exists. Custom items are included in the menu-value total using that charged rate. No historical rate is invented when editing those older orders. This is a menu-price comparison; the partner's actual payable remains the submitted daily supplier bill.

Admins can open Food Sources & Partners from the Overview shortcut. Record deletion now uses a confirmation popup, reports database errors, and removes a confirmed deleted record from all local lists immediately, without waiting for realtime or a page refresh. Deleted records remain filtered out of stale in-flight refresh responses. Deleting a food order returns its previously tracked inventory according to the existing inventory trigger; existing supplier bills remain and should be reviewed. These improvements need no extra database migration.

## Accounting & Cash Management

**Overview → Record Daily Expense** is available to staff and admins. Staff record invoices, payment status, and the actual paying account; account setup and financial reports remain admin-only. The former Expenses & Capital page is now **Accounting**. It includes cash on hand, bank/QR balance, accounts receivable, customer advances, expense/supplier payables, owner/staff reimbursements, owner loans, and recorded equity contributions.

### Activate and establish balances

1. After the food-partner migration, run [`supabase/migrations/20261027_accounting.sql`](supabase/migrations/20261027_accounting.sql) in Supabase SQL Editor. The full `schema.sql` also includes it for new installations.
2. Refresh the dashboard and open Accounting.
3. Choose **Reconcile cash & bank**. Enter the cash physically held and the bank/QR balance available **now**, with a count/statement reference. The first count establishes opening balances; later counts record adjustments. Count when receipts/payments are quiet.

The migration retains old expense and capital records. The old expense workflow represented paid bills, so those records remain paid. Payments without a known account are marked **Unclassified (legacy)**, not guessed as cash or bank. Known receivables and liabilities are brought forward as opening positions; old receipts and spending are not replayed into today's cash balances. Already-reimbursed personal expenses do not become new owner liabilities. Historical capital contributions are shown separately and are not invented as new money received. This is a management ledger from the tracking start, not a reconstruction of every historical asset or bank statement.

### Expense invoices, payments, and funding

- Record the invoice total, vendor/employee, incurred date, due date, category, and classification. Salaries, rent, electricity, internet, maintenance, bank charges, food stock, tournament costs, and other operating expenses have explicit categories. Asset purchases are **capital expenditure**, not operating costs.
- An unpaid invoice has amount paid zero and appears in **Accounts Payable**. Part-payments can be recorded later from different accounts (e.g. cash first, bank later). Overpayments and duplicate request retries are rejected safely. Upcoming/overdue bills remain visible even outside report date filters.
- Paying from a staff member's/owner's personal funds settles the vendor invoice and creates a personal reimbursement liability. Use **Receipt / transfer → Reimburse staff / owner** when the cafe returns that money; it is not a second expense. Use the same payer name consistently.
- Cash deposits/withdrawals are **cash ↔ bank transfers**, not expenses or income. Equity contributions and owner loans are financing transactions. Loans are tracked separately from capital and can be repaid against their outstanding balance.
- Actual session collections, changes in customer receivables, daily food supplier bills, and partner payouts post automatically to balanced journal entries. Cash payments affect cash on hand; Online/QR payments affect the bank/QR account. Booking deposits are **customer advances** until the session becomes active. Partner payments reduce the payable without recognizing supplier cost twice. Linking an old supplier payout does not create a second cash withdrawal.
- Tournament registration/confirmation counts do not reliably identify actual cash versus bank receipts. Record any actual tournament receipt that lacks a payment-account record through **Other actual receipt**, and prizes/costs as expenses. Do not manually duplicate session receipts or food-source payments that already post automatically.

The current-position cards are independent of date filters. The expense register and analysis use invoice/report dates; the cash/bank books use posting/payment dates. **Invoiced operating result** recognizes customer invoices, deducts actual partner bills and operating expenses, excludes unbilled partner margins, and is before depreciation/tax. Capital purchases and owner funding do not affect this operating result. The Revenue comparison charts retain the operational, collections-based earnings view, including recorded tournament net figures, before general operating expenses. Cash flow, collections-based earnings, and invoiced results are different measures and are labelled separately.

Use **Void / correct** for a duplicate/incorrect expense. Corrections retain the audit trail and reverse its journal effect; they do not execute a real cash refund or bank transfer. Existing supplier payment corrections stay in Food Sources & Partners. Deleting a session likewise reverses its bookkeeping entries, so review counts after correcting historical records. Cash/bank reconciliation is a balance adjustment, not sales income. Negative book balances flag missing/misclassified transactions for review.

### Comparisons and verification

Accounting adds a daily cash/bank movement chart and operating-expense category chart. Revenue adds daily/weekly/monthly comparisons and averages, including zero-earning days; calendar weeks/months at report boundaries can be partial. Food Sources adds a collections-versus-actual-bills-versus-retained-earnings chart. Cash/bank books can be exported to CSV.

`npm test` includes accounting calculations, expense status, capital classification, date grouping, zero-day averages, and UI wiring. `npm run test:accounting:db` runs migrations and transaction tests against the isolated local `inventory_schema_test` database, checking balanced journals, permissions, cash/bank part-payments, owner reimbursements/loans, capital, customer advances/receivables, supplier payouts, corrections, retry safety, and concurrent overpayment prevention. It does not use production credentials. Access continues to use the application's existing trusted staff-ID login model.


## Native ChillPill hourly loyalty

**ChillPill Loyalty** is available to staff and admins in Operations and from Overview. It replaces the LinkyPot visit-based POS stamp/reward integration. The external LinkyPot embed remains available for digital-card features; checkout no longer sends visits to it or redeems its percentage-based rewards.

**Activation:** after the existing inventory/food-partner/accounting migrations, run [supabase/migrations/20261027_loyalty.sql](supabase/migrations/20261027_loyalty.sql) in Supabase SQL Editor, then refresh. New installations receive it through schema.sql. The migration automatically includes existing completed sessions; it does not import LinkyPot visit stamps or reward redemptions. Review any rewards already honoured in the old programme before using the separate native balance.

- One stamp for every **complete 60 minutes in a single completed gaming session**. 59 minutes earns zero, 60–119 minutes earns one, 120 minutes earns two. Two 30-minute sessions, on the same or different days, each earn zero. Fractions never carry between sessions.
- Time is the union of occupied playing intervals for that visit. Simultaneous stations count once; sequential playing time counts, gaps and pauses do not. Station completion stops its time. Unplayed future booking time does not qualify. Food-only, cancelled, waived/internal sessions and invalid/missing customer phones do not earn stamps. A real completed visit with an unpaid bill still earns for the time played.
- Use the same customer phone consistently. Formatting characters and the Nepal +977/00977 prefix are normalized. Customer details expand to show each visit's playing duration and stamps, historical estimates, and reward redemption history.
- Each 10 stamps unlocks one reward. Multiple rewards can accumulate; checkout uses at most one reward per session. Choose one station to credit up to 60 minutes at that station's recorded rate, capped by its booked and elapsed playing time. Other stations and food remain payable. Using a reward on a shorter session consumes the entire reward; unused minutes do not carry. The reward replaces other checkout discounts. Stamps from the current session become spendable only after completion, and playing time covered by a reward still earns hourly stamps.
- Native stamp awards and reward consumption are database-owned. Checkout and redemption commit together, duplicate retries do not consume twice, and simultaneous checkouts cannot spend the same last reward. A failed checkout leaves the session active. Reward credits remain visible in invoices, revenue discounts, and accounting.
- Editing an old completed visit recalculates its stamps. Cancelling/deleting a visit removes its award and reverses that visit's reward redemption, if any. A spent reward is not retroactively charged when an earlier earning visit is corrected: any stamp deficit must be recovered before further rewards are available. Redeemed visit credits are retained when editing; cancel/delete and start a fresh session to reverse or redo a redemption. Corrections do not execute physical cash/bank refunds.

Old completed records are labelled **Historical**. They use saved station start/end times, durations and completion/pause markers. Earlier resumed pauses did not retain exact intervals: extended end times are capped conservatively to recorded play duration when no overtime was charged. Exact historical pause chronology cannot be reconstructed. New pause/resume intervals are retained in the database even after the visible pause tags are removed. The new migration changes no historical bill amounts or payment accounts.

Verification: npm test includes native loyalty UI/billing checks; npm run test:loyalty:db uses only the isolated local inventory_schema_test database and covers hour boundaries, overlaps, gaps, overnight extra stations, pauses, historical backfill, phone identity, rewards, failed-save rollback, retry/concurrency, corrections and balanced accounting. The existing trusted staff-ID access model remains in use.
