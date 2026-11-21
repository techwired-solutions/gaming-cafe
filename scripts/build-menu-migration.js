const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'assets', 'data', 'revised_menu_items.json');
const items = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Build SQL values
const sqlValues = items.map(it => {
  const safeName = it.name.replace(/'/g, "''");
  const safeCat = it.category.replace(/'/g, "''");
  const safeSupplier = it.supplier.replace(/'/g, "''");
  return `  ('${safeName}', ${it.price}, '${safeCat}', '${safeSupplier}')`;
}).join(',\n');

const migrationSql = `-- =====================================================================
-- Migration: 20261121_revised_menu_items.sql
-- Description: Revised comprehensive menu items combining:
--   - ChillPill Gaming Cafe (CP: 'chillpill')
--   - Bro's Burger Hub (BB: 'bros_burger')
--   - Bardali Sekuwa & Thali (BD: 'bardali')
--
-- Features clean, proper categorization without repetitions or category overlap:
--   - 'Burgers & Wraps' and 'Pizza' separated into distinct categories.
--   - 'Thali & Platters' and 'Sekuwa' properly separated; all Sekuwa & Sekuwa Jhaneko together.
--   - 'Sadheko & Choila' groups cold spiced Choila & Sadheko items together.
--   - 'Nepali Specialties' groups Poleko, Sukuti, Chiura sets, and local delicacies.
--   - 'Beer & Cider' and 'Wine' separated; Tequila unified into 'Spirits'.
--   - 'Coffee & Tea' and 'Cold Drinks & Refreshers' separated.
--   - 'Pangra Fry' clearly distinguished from 'Pangra Sekuwa (Set)'.
--   - Bardali food prices include the 20% markup cleanly rounded to nearest 5.
-- Total items: ${items.length}
-- =====================================================================

begin;

-- 1. Insert new items that do not yet exist for the supplier
insert into public.menu_items (name, price, category, supplier)
select m.name, m.price, m.category, m.supplier
from (values
${sqlValues}
) as m(name, price, category, supplier)
where not exists (
  select 1 from public.menu_items existing
  where lower(trim(existing.name)) = lower(trim(m.name))
    and coalesce(existing.supplier, 'chillpill') = coalesce(m.supplier, 'chillpill')
);

-- 2. Update existing items' prices and categories to the revised values
update public.menu_items existing
set price = m.price,
    category = m.category
from (values
${sqlValues}
) as m(name, price, category, supplier)
where lower(trim(existing.name)) = lower(trim(m.name))
  and coalesce(existing.supplier, 'chillpill') = coalesce(m.supplier, 'chillpill')
  and (existing.price is distinct from m.price or existing.category is distinct from m.category);

commit;
`;

const migrationPath = path.join(root, 'supabase', 'migrations', '20261121_revised_menu_items.sql');
fs.writeFileSync(migrationPath, migrationSql, 'utf8');
console.log(`Updated migration at ${migrationPath}`);
