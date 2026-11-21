const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'scratch', 'processed_menu.json');
const items = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// Clean items
const cleanItems = items.map(it => ({
  name: it.name.trim(),
  price: Number(it.price),
  category: it.category.trim(),
  supplier: it.supplier.trim()
}));

// Build SQL values
const sqlValues = cleanItems.map(it => {
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
-- Bardali food prices include the 20% markup cleanly rounded to nearest 5.
-- Total items: ${cleanItems.length}
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

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261121_revised_menu_items.sql');
fs.writeFileSync(migrationPath, migrationSql, 'utf8');
console.log(`Generated migration with ${cleanItems.length} items at: ${migrationPath}`);

// Also write assets/data/revised_menu_items.json
const dataDir = path.join(__dirname, '..', 'assets', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const jsonOutPath = path.join(dataDir, 'revised_menu_items.json');
fs.writeFileSync(jsonOutPath, JSON.stringify(cleanItems, null, 2), 'utf8');
console.log(`Saved JSON menu dataset at: ${jsonOutPath}`);
