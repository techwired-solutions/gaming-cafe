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
  OPENING_HOURS: "10:00 AM – 11:00 PM · Every day",

  // --- WhatsApp booking (placeholder — overridden by config.local.js / env vars) ---
  // Country code + number, digits only, no + or spaces (e.g. 9779812345678).
  WHATSAPP_NUMBER: "PLACEHOLDER_WHATSAPP_NUMBER",
  WHATSAPP_DEFAULT_MESSAGE: "Hi! I'd like to book a PlayStation slot at ChillPill Gaming Cafe.",

  // Dashboard access is per-staff now (Staff tab in the dashboard creates
  // individual logins) — there's no shared dashboard password anymore.

  // --- Billing defaults ---
  DEFAULT_HOURLY_RATE: 100,

  // How many minutes before a session ends the owner gets alerted.
  ALERT_MINUTES_BEFORE_END: 5
};
