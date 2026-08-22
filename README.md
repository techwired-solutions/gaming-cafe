# PlayBox Gaming Cafe — website + owner console

A two-page project for a hourly-PlayStation gaming cafe:

- **`index.html`** — the public website (info, ambience, games, pricing, food menu, contact/map, WhatsApp booking button). No online booking form — customers message you on WhatsApp and you confirm manually.
- **`dashboard.html`** — the owner's console (private, password-gated) for tracking sessions, time remaining, food orders, billing, and the food/drinks menu. Backed by Supabase so it works from any device/browser and multiple staff can see the same live data.

Plain HTML/CSS/JS — no framework. There's one tiny build step (`scripts/generate-config.js`) whose only job is to keep your real Supabase keys, WhatsApp number, and dashboard password **out of git entirely**; see step 2 below.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up / log in → **New project**.
2. Pick a name (e.g. `playbox-gaming-cafe`), a database password (save it somewhere), and a region close to Nepal (e.g. Singapore).
3. Wait ~2 minutes for it to finish provisioning.
4. Open **SQL Editor** (left sidebar) → **New query** → paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   - This creates the `sessions`, `menu_items`, and `settings` tables, turns on Row Level Security, and enables realtime sync.
   - If you re-run it later, it's safe — it uses `if not exists` / `on conflict` guards.
5. Go to **Project Settings → API**. Copy:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

## 2. Fill in your config

Real values (Supabase keys, WhatsApp number, dashboard password) are **never committed to git**. They're layered on top of the tracked `assets/js/config.js` defaults by a small override file, `assets/js/config.local.js` — which is gitignored — so the repo stays safe to make public later even though it currently has your real values applied locally.

**For local testing on your own computer:**

1. Copy [`assets/js/config.local.example.js`](assets/js/config.local.example.js) to `assets/js/config.local.js` (same folder).
2. Fill in the real values in that new file. It's already gitignored, so `git status` won't even show it.

**For the live Vercel deployment**, don't edit any file at all — instead set these as **Environment Variables** in Vercel (Project → Settings → Environment Variables), and the build step (`scripts/generate-config.js`, wired up in `vercel.json`) turns them into `config.local.js` automatically on every deploy:

| Environment variable | What to put |
|---|---|
| `SUPABASE_URL` | Your Project URL from step 1 |
| `SUPABASE_ANON_KEY` | Your anon public key from step 1 |
| `WHATSAPP_NUMBER` | Your WhatsApp number, country code + digits only, e.g. `9779812345678` |
| `DASHBOARD_PASSWORD` | A password only you/staff know, to open the dashboard |
| `CAFE_NAME`, `CAFE_TAGLINE`, `CAFE_LOCATION`, `CAFE_ADDRESS_LINE`, `OPENING_HOURS`, `WHATSAPP_DEFAULT_MESSAGE`, `DEFAULT_HOURLY_RATE`, `ALERT_MINUTES_BEFORE_END` | Optional — only set these if you want to override the defaults already in `assets/js/config.js` without editing code |

After adding/changing env vars in Vercel, trigger a redeploy for them to take effect.

Everything else (pricing table numbers, game list, ambience section) lives directly in `index.html` as plain text/HTML — search for the section (`<section id="pricing">`, `<section id="games">`, etc.) and edit it like a normal web page.

## 3. Add real photos (optional but recommended)

The "ambience" and hero sections currently show dashed placeholder boxes. To swap them for real photos:

1. Drop your image files into `assets/images/`.
2. In `index.html`, find the `placeholder-art` `<div>`s and replace them with `<img src="assets/images/your-photo.jpg" class="rounded-2xl aspect-square object-cover" alt="...">`.

## 4. Run it locally

No server needed — but browsers restrict some things when opening `file://` directly, so serve it locally instead:

```bash
npx serve .
```

Then open the printed `http://localhost:...` URL. Visit `/dashboard.html` for the owner console. (Make sure you've created `assets/js/config.local.js` per step 2 first, otherwise you'll see placeholder values and a "Supabase not configured" notice.)

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo (or drag-and-drop deploy from the Vercel dashboard).
2. In Vercel: **Add New Project** → import the repo → framework preset **"Other"** → **Deploy**. Vercel will auto-detect `vercel.json`'s `buildCommand` (`npm run build`), which runs `scripts/generate-config.js`.
3. **Before or right after** the first deploy, add the Environment Variables from step 2 (Project → Settings → Environment Variables), then redeploy so they take effect.
4. Your site will be live at `your-project.vercel.app`. The dashboard is reachable at `/dashboard` or `/dashboard.html` (kept out of search engines via `vercel.json`).
5. Point your own domain at it later from the Vercel project's **Domains** tab, if you have one.

---

## How the time tracking & 5-minute alert works

- When you save a session as **Active** (or mark a **Booked** customer as arrived), the console stores a `start_time` and computes `end_time = start_time + duration`.
- Every active session card shows a live **"Ends in Xh Ym"** countdown. The card border turns amber when under the alert threshold, and red once it's overdue.
- Exactly **5 minutes before `end_time`** (configurable via `ALERT_MINUTES_BEFORE_END`), the owner console:
  - Plays a short beep and shows an in-app toast.
  - Sends a **browser notification** (if you click "Enable alerts" once and allow the permission prompt) — this fires even if the dashboard tab is in the background, as long as the browser/computer stays on.
  - Marks that session so it won't alert again for the same 5-minute warning.
- When the timer hits zero, it fires a second "Time's up!" alert.
- Use the **+15 min** button on an active card to extend a session on the spot (recalculates the bill and re-arms the alert), or **Mark complete** to close it out.

Browser notifications only work while the dashboard is open in a tab (even backgrounded) on a device that's powered on — there's no SMS/push-to-phone in this version. If you want a phone alert regardless of whether the dashboard is open, that would need a small server-side add-on (e.g. a Supabase Edge Function + WhatsApp/SMS API) — let me know if you'd like that added later.

## Security note (please read)

This project uses only Supabase's public **anon key** — there's no login-account system (no Supabase Auth). That keeps setup simple, but it means:

- The dashboard's password screen is a **UI-level lock only**. It stops casual visitors from opening the console in a browser, but it does **not** protect the underlying database — anyone who extracts your anon key and URL from the deployed JS could, in theory, read/write the `sessions` and `menu_items` tables directly via the Supabase API.
- This is a normal, common trade-off for a small single-location business tool, but don't store anything more sensitive than name/phone/order info in it (no payment details, no ID documents).
- If you later want real protection: add Supabase Auth (owner + staff logins) and change the Row Level Security policies in `supabase/schema.sql` from `using (true)` to `using (auth.uid() is not null)`. Ask me and I can wire that up.
- Separately: your Supabase anon key, WhatsApp number, and dashboard password never touch git (see step 2) — they only ever exist in Vercel's encrypted Environment Variables and in your own gitignored `config.local.js`. This means the repo itself stays safe to make public later even though the *deployed site* will always expose the anon key and password in its JS (that part is unavoidable for a backend-less static site, and is what the point above is about).

## Project structure

```
Gaming-Cafe/
├─ index.html                     # public website
├─ dashboard.html                 # owner console (password-gated)
├─ vercel.json                    # build command + clean URLs + noindex header for /dashboard
├─ package.json                   # "build" script → scripts/generate-config.js
├─ scripts/
│  └─ generate-config.js          # turns Vercel env vars into config.local.js at build time
├─ assets/
│  ├─ js/
│  │  ├─ config.js                # tracked, public-safe defaults (committed)
│  │  ├─ config.local.example.js  # template — copy to config.local.js for local dev (committed)
│  │  ├─ config.local.js          # ← your real values (gitignored, never committed)
│  │  ├─ supabaseClient.js        # builds the shared Supabase client
│  │  ├─ dashboard.js             # owner console logic
│  │  └─ site.js                  # public site logic
│  ├─ css/                        # (styles are inline in each page; folder reserved for future use)
│  └─ images/                     # put your real photos here
└─ supabase/
   └─ schema.sql                  # run once in Supabase's SQL editor
```
