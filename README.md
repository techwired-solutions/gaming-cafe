# ChillPill Gaming Cafe

**Public website and owner/staff operations console.**

[Visit ChillPill](https://chillpill.com.np/) · [Setup and operations](docs/SETUP_AND_OPERATIONS.md)

A business application for a gaming cafe in Budhanilkantha, Kathmandu. The public
website presents the space, games, pricing and contact details; the operations
console supports the staff's day-to-day work.

## Main workflows

- Public information, food menu and WhatsApp booking enquiries.
- Stations, sessions, waiting lists, pauses and overtime calculations.
- Checkout, discounts, billing records and revenue/accounting views.
- Inventory, food partners and loyalty features represented in the source.
- Staff/admin roles and live content/menu/pricing updates.

Public bookings are confirmed manually through WhatsApp. The console and website
use HTML, CSS and JavaScript, with Supabase for shared data and realtime updates.

## Local setup

1. Create a separate development Supabase project and apply the schema/migrations
   described in the [operations guide](docs/SETUP_AND_OPERATIONS.md).
2. Copy `assets/js/config.local.example.js` to `assets/js/config.local.js` and
   supply development configuration. The local override is ignored by Git.
3. Install Node.js and npm, then run:

```sh
npm install
npm run build
npm start
```

The build generates configuration and synchronizes `/admin` and `/staff` pages
from the dashboard. Follow the role/setup instructions before using either
console. Use unique development accounts rather than historical sample passwords.

## Verification

```sh
npm test
```

The normal test command covers local session, inventory, billing/accounting and
loyalty calculations. Separate `test:*:db` scripts contact Supabase; use a test
database and inspect their prerequisites before running them. Passing local
checks does not establish that a particular production database is configured correctly.

## Structure and operations

| Path | Responsibility |
| --- | --- |
| `index.html` | Public cafe website |
| `dashboard.html` | Shared owner/staff console |
| `assets/js/` | Interface, calculations and configuration helpers |
| `scripts/` | Build utilities and checks |
| `supabase/` | Database schema and migrations |

See [setup and operations](docs/SETUP_AND_OPERATIONS.md) for station rules,
pauses, billing, staff roles, inventory, accounting, deployment and security
limitations. Keep business records backed up and validate role restrictions
before exposing a new installation.

Built by Sudip Parajuli / Techwired Solutions.

### Supplier payment expense type fix (2026-11-03)

For existing databases, run `supabase/migrations/20261103_food_partner_payment_type.sql` in the Supabase SQL Editor before retrying a failed Food Sources & Partners payment. Supplier payouts now explicitly set the linked expense type to `ongoing`, including installations where this required column has no default. The migration only replaces the payment function; it does not modify existing bills or payments.

### Excel / CSV statements, archives and Nepali monthly comparisons (2026-11-17)

The admin Statements button supports PDF, Excel (.xlsx, a worksheet per statement section) and CSV (a ZIP with a CSV per section). Files are built locally in the browser. Excel amount/count columns are numeric; phones and dates remain literal text. CSV exports escape formula prefixes. The workbook writer rejects overlong Excel cells rather than silently truncating them; CSV and the full JSON archive preserve long fields.

Activate existing databases by running `supabase/migrations/20261117_record_archives.sql` in Supabase SQL Editor after the inventory, food-partner, accounting/admin and loyalty/time migrations. Refresh the dashboard afterwards. Fresh installations use the full schema. No production records are erased by installing the migration. If an older migration replaces trigger functions later, reapply the archive migration; cleanup checks that its reversal safeguards are still installed.

Accounting shows all Nepali (Bikram Sambat) months, their AD date boundaries, income, operating costs, surplus and average income/cost per calendar day, plus a comparison chart for the latest 24 months. Income is customer collections plus other journal income; operating costs are non-void operating expense invoices and actual supplier bills, counted once. Capital purchases, contributions and transfers are excluded. Earlier months use every calendar day, including zero-earning days; the current month uses days elapsed. The pinned MIT-licensed nepali-date-converter 3.4.0 supplies calendar boundaries; the cleanup calendar table covers BS 2000–2089 and refuses cleanup outside its supported current-month range. Monthly statement sections include full months overlapping the selected date range and are labelled accordingly.

Use **Accounting → Archive / clean old details** at month-end. This is an explicit admin action, not an automatic scheduled deletion:

1. Select a cutoff before the current Nepali month (default: the previous Nepali month's last day). Download a full ZIP containing readable Excel/CSV statements and `records.json` with all exported operational/financial fields, including nested details, journal lines, waiting entries, tournament matches and stock allocations. This is a data archive, not an automatic database restore file; it excludes staff credentials and private application configuration.
2. Save the file somewhere safe and verify that it opens. The browser cannot prove that a file was saved, so the admin must acknowledge this.
3. Type exactly `CONFIRM` to erase eligible details. The server requires the matching archive acknowledgement, rejects archives older than two hours and rejects changes made since the archive snapshot. Prepare another archive if records changed.

Cleanup removes settled/cancelled session rows, their detailed loyalty visits and stock allocations, old stock movements not associated with remaining sessions, and closed waiting entries. It carries loyalty earnings and playing seconds forward per phone, retains redeemed/voided reward history, and strips archived checkout payloads. Unpaid/partial sessions, active sessions and bookings remain. Daily compact revenue/source totals remain; old supplier bill corrections still recalculate retained margins. Session journals are compacted by actual posting date, account and party, preserving both debit and credit totals rather than changing balances or returning sold stock. Other journals, expense invoices/payment histories, supplier bills, owner funding/commitments, current inventory, settings and tournaments are retained. These small daily summaries and financial books keep monthly comparisons and cash/bank/receivable/payable totals available after visit details are erased. Per-customer/station/staff visit detail is only in the downloaded archive. Each cleanup records its filename, cutoff, admin, snapshot fingerprint and removed counts; retries do not duplicate summaries or stamps.

Validation: `npm test` and `npm run test:archives:db` (isolated `inventory_schema_test` database on loopback port 55439; configure `INVENTORY_TEST_PSQL` when needed). The archive DB suite runs changes inside a rolled-back transaction and checks payment/date/confirmation/stale guards, loyalty, journals, stock, repeat cleanup and ordinary deletion reversals. Do not run DB tests against production.
