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
