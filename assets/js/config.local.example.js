/**
 * Template for local development.
 *
 * Copy this file to `config.local.js` (same folder) — that filename is
 * gitignored so your real values never get committed — and fill it in with
 * your actual Supabase project + cafe details.
 *
 * On Vercel, you don't need this file at all: set the same keys as
 * Environment Variables in the Vercel project settings instead, and
 * scripts/generate-config.js will generate config.local.js automatically at
 * build time. See README.md for the full list of variable names.
 */
Object.assign(window.APP_CONFIG, {
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-supabase-anon-public-key",
  WHATSAPP_NUMBER: "9779800000000"
});
