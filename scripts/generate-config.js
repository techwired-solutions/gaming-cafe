#!/usr/bin/env node
/**
 * Runs as Vercel's build command (see vercel.json / package.json).
 *
 * Reads the ChillPill config keys from environment variables (set in Vercel →
 * Project → Settings → Environment Variables — see README.md for the full
 * list) and writes them into assets/js/config.local.js, which
 * index.html/dashboard.html load right after the tracked assets/js/config.js
 * defaults. This keeps every real secret out of git entirely.
 *
 * If no relevant environment variables are set (e.g. a fresh clone before
 * Vercel env vars are configured), this is a no-op and the site falls back
 * to the placeholder values in assets/js/config.js.
 */
const fs = require("fs");
const path = require("path");

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CAFE_NAME",
  "CAFE_TAGLINE",
  "CAFE_LOCATION",
  "CAFE_ADDRESS_LINE",
  "OPENING_HOURS",
  "WHATSAPP_NUMBER",
  "WHATSAPP_DEFAULT_MESSAGE",
  "DEFAULT_HOURLY_RATE",
  "ALERT_MINUTES_BEFORE_END",
  "OVERTIME_GRACE_MINUTES"
];
const NUMERIC_KEYS = new Set(["DEFAULT_HOURLY_RATE", "ALERT_MINUTES_BEFORE_END", "OVERTIME_GRACE_MINUTES"]);

const overrides = {};
KEYS.forEach((key) => {
  const value = process.env[key];
  if (value !== undefined && value !== "") {
    overrides[key] = NUMERIC_KEYS.has(key) ? Number(value) : value;
  }
});

const outPath = path.join(__dirname, "..", "assets", "js", "config.local.js");

if (Object.keys(overrides).length === 0) {
  console.log("[generate-config] No ChillPill environment variables set — leaving assets/js/config.js placeholders as-is.");
  process.exit(0);
}

const contents = `/**
 * AUTO-GENERATED at build time by scripts/generate-config.js from Vercel
 * Environment Variables. Do not edit by hand; do not commit real values here.
 */
Object.assign(window.APP_CONFIG, ${JSON.stringify(overrides, null, 2)});
`;

fs.writeFileSync(outPath, contents);
console.log(`[generate-config] Wrote ${outPath} with keys: ${Object.keys(overrides).join(", ")}`);
