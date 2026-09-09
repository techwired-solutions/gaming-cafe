/**
 * ChillPill Gaming Cafe — shared configuration (tracked defaults)
 * ---------------------------------------------------------------
 * This file only holds PUBLIC, non-sensitive defaults and is safe to commit.
 * Real values (Supabase keys, WhatsApp number) are layered on top by one of:
 *   - assets/js/config.local.js  (gitignored — for local development; copy
 *     assets/js/config.local.example.js to get started)
 *   - Vercel Environment Variables, turned into config.local.js automatically
 *     at build time by scripts/generate-config.js (see README.md)
 *
 * Loaded by both index.html (public site) and dashboard.html (owner console),
 * before config.local.js.
 */
window.APP_CONFIG = {
  // --- Supabase (placeholders — overridden by config.local.js / env vars) ---
  SUPABASE_URL: "PLACEHOLDER_SUPABASE_URL",        // e.g. https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: "PLACEHOLDER_SUPABASE_ANON_KEY", // the long "anon public" key

  // --- Cafe info fallback (the real, editable copy lives in Supabase's
  // `settings` table — dashboard → Cafe Content tab — and takes priority
  // over these once Supabase is connected) ---
  CAFE_NAME: "ChillPill Gaming Cafe",
  CAFE_TAGLINE: "Console gaming, snacks & good vibes.",
  CAFE_LOCATION: "Budhanilkantha, Kathmandu",
  CAFE_ADDRESS_LINE: "Budhanilkantha, Kathmandu, Nepal",
  OPENING_HOURS: "7:00 AM – 8:00 PM · Every day",

  // --- WhatsApp booking ---
  // Official number: +977 9765130636
  WHATSAPP_NUMBER: "9779765130636",
  WHATSAPP_DEFAULT_MESSAGE: "Hi! I'd like to book a PlayStation slot at ChillPill Gaming Cafe.",

  // --- Business & Tax Registration ---
  PAN_NUMBER: "625001462",

  // --- Financial & Capital Base ---
  INITIAL_CAPITAL: 1500000, // NPR 15 Lakhs

  // --- Location & Google Maps ---
  GOOGLE_MAPS_URL: "https://maps.app.goo.gl/uBQnASzc9W2igYmh6",
  GOOGLE_MAPS_IFRAME: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3530.0860682946586!2d85.35793105079674!3d27.77632208218303!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39eb1d0cc213f965%3A0x4d68ddb7b0d35f09!2sChillPill%20Gaming%20Cafe!5e0!3m2!1sen!2snp!4v1788927158116!5m2!1sen!2snp",

  // --- Billing defaults ---
  DEFAULT_HOURLY_RATE: 100,

  // How many minutes before a session ends the owner gets alerted.
  ALERT_MINUTES_BEFORE_END: 5,

  // Grace period after a session's end time before an overtime charge
  // starts accruing at checkout.
  OVERTIME_GRACE_MINUTES: 5
};
