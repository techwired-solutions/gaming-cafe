#!/usr/bin/env node
/**
 * Copies dashboard.html to admin.html and staff.html.
 *
 * Why: Vercel's `cleanUrls: true` reliably serves any X.html file at the
 * clean URL /X (that's what makes /dashboard work, serving dashboard.html).
 * We initially tried to get /admin and /staff working purely through
 * vercel.json `rewrites` instead of real files, but in testing Vercel
 * didn't apply those rewrites even though the correct vercel.json was
 * confirmed live — so instead we lean on the *proven* cleanUrls mechanism
 * by keeping real admin.html / staff.html files in sync with dashboard.html.
 *
 * All three files are byte-identical — dashboard.js decides which login
 * form to show (password-only "admin" vs username+password "staff") purely
 * by reading location.pathname at runtime, so no per-file differences are
 * needed here.
 *
 * Run this automatically as part of `npm run build` (see package.json /
 * vercel.json), and also directly — `npm run sync-console-pages` — any
 * time you hand-edit dashboard.html locally, so the copies committed to
 * git don't drift out of sync in the meantime.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = path.join(root, "dashboard.html");
const targets = ["admin.html", "staff.html"];

const contents = fs.readFileSync(source, "utf8");
targets.forEach((name) => {
  fs.writeFileSync(path.join(root, name), contents);
  console.log(`[sync-console-pages] Wrote ${name} from dashboard.html`);
});
