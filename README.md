# PlayBox Gaming Cafe — website + owner console

A two-page project for a hourly-PlayStation gaming cafe:

- **`index.html`** — the public website (info, ambience, games, pricing, food menu, contact/map, WhatsApp booking button). No online booking form — customers message you on WhatsApp and you confirm manually.
- **`dashboard.html`** — the owner's console (private, password-gated) for tracking sessions, time remaining, food orders, billing, and the food/drinks menu. Backed by Supabase so it works from any device/browser and multiple staff can see the same live data.

No build step, no framework — plain HTML/CSS/JS. Deploys to Vercel as a static site.

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

Open [`assets/js/config.js`](assets/js/config.js) and replace the `PLACEHOLDER_*` values:

| Key | What to put |
|---|---|
| `SUPABASE_URL` | Your Project URL from step 1 |
| `SUPABASE_ANON_KEY` | Your anon public key from step 1 |
| `WHATSAPP_NUMBER` | Your WhatsApp number, country code + digits only, e.g. `9779812345678` |
| `DASHBOARD_PASSWORD` | A password only you/staff know, to open the dashboard |
| `CAFE_NAME`, `CAFE_LOCATION`, `OPENING_HOURS`, etc. | Already set to PlayBox Gaming Cafe / Budhanilkantha, Kathmandu — tweak as needed |

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

Then open the printed `http://localhost:...` URL. Visit `/dashboard.html` for the owner console.

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo (or drag-and-drop deploy from the Vercel dashboard).
2. In Vercel: **Add New Project** → import the repo → framework preset **"Other"** (it's static HTML, no build command needed) → **Deploy**.
3. Your site will be live at `your-project.vercel.app`. The dashboard is reachable at `/dashboard` or `/dashboard.html` (kept out of search engines via `vercel.json`).
4. Point your own domain at it later from the Vercel project's **Domains** tab, if you have one.

Since `config.js` is a plain client-side file, you can also edit it straight from Vercel/GitHub's web editor after deploying, without touching your computer.

---

## How the time tracking & 5-minute alert works

- When you save a session as **Active** (or mark a **Booked** customer as arrived), the console stores a `start_time` and computes `end_time = start_time + duration`.
- Every active session card shows a live **"Ends in Xh Ym"** countdown. The card border turns amber when under the alert threshold, and red once it's overdue.
- Exactly **5 minutes before `end_time`** (configurable via `ALERT_MINUTES_BEFORE_END` in `config.js`), the owner console:
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

## Project structure

```
Gaming-Cafe/
├─ index.html              # public website
├─ dashboard.html          # owner console (password-gated)
├─ vercel.json             # clean URLs + noindex header for /dashboard
├─ assets/
│  ├─ js/
│  │  ├─ config.js         # ← edit this with your Supabase + cafe details
│  │  ├─ supabaseClient.js # builds the shared Supabase client
│  │  ├─ dashboard.js      # owner console logic
│  │  └─ site.js           # public site logic
│  ├─ css/                 # (styles are inline in each page; folder reserved for future use)
│  └─ images/               # put your real photos here
└─ supabase/
   └─ schema.sql           # run once in Supabase's SQL editor
```
