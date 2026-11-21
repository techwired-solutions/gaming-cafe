const fs = require('fs');
const path = require('path');

const items = require('../assets/data/revised_menu_items.json');
const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
let schema = fs.readFileSync(schemaPath, 'utf8');

const sqlValues = items.map(it => {
  const safeName = it.name.replace(/'/g, "''");
  const safeCat = it.category.replace(/'/g, "''");
  const safeSupplier = it.supplier.replace(/'/g, "''");
  return `    ('${safeName}', ${it.price}, '${safeCat}', '${safeSupplier}')`;
}).join(',\n');

const newSeedBlock = `-- ---------------------------------------------------------------------
-- Seed revised menu items if empty (combines ChillPill, Bro's Burger & Bardali)
-- ---------------------------------------------------------------------
insert into public.menu_items (name, price, category, supplier)
select name, price, category, supplier from (
  values
${sqlValues}
) as m(name, price, category, supplier)
where not exists (select 1 from public.menu_items limit 1);`;

const targetRegex = /-- ---------------------------------------------------------------------\r?\n-- Seed standard menu items if empty[\s\S]*?where not exists \(select 1 from public\.menu_items limit 1\);/;

if (!targetRegex.test(schema)) {
  console.error("Could not find seed block in schema.sql!");
  process.exit(1);
}

schema = schema.replace(targetRegex, newSeedBlock);
fs.writeFileSync(schemaPath, schema, 'utf8');
console.log("Successfully updated menu_items seed block in supabase/schema.sql!");
