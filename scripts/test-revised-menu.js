const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsonItems = require(path.join(root, 'assets', 'data', 'revised_menu_items.json'));
const jsItems = require(path.join(root, 'assets', 'js', 'menu-defaults.js'));
const migrationSql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261121_revised_menu_items.sql'), 'utf8');
const schemaSql = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const staffHtml = fs.readFileSync(path.join(root, 'staff.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 1. JSON and JS items match and have 280 items
assert.strictEqual(jsonItems.length, 280, 'Expected exactly 280 menu items');
assert.strictEqual(jsItems.length, 280, 'Expected 280 menu items in menu-defaults.js');
assert.deepStrictEqual(jsonItems, jsItems, 'JSON items and JS items must be identical');

// 2. Validate suppliers and price rounding
const validSuppliers = new Set(['chillpill', 'bros_burger', 'bardali']);
const supplierCounts = { chillpill: 0, bros_burger: 0, bardali: 0 };
const categoryCounts = {};

jsonItems.forEach((item, idx) => {
  assert.ok(item.name && item.name.trim().length > 0, `Item ${idx} missing name`);
  assert.ok(typeof item.price === 'number' && item.price >= 0, `Item ${item.name} has invalid price`);
  assert.ok(validSuppliers.has(item.supplier), `Item ${item.name} has unknown supplier: ${item.supplier}`);
  assert.ok(item.category && item.category.trim().length > 0, `Item ${item.name} missing category`);

  supplierCounts[item.supplier]++;
  categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;

  if (item.supplier === 'bardali') {
    assert.strictEqual(
      item.price % 5,
      0,
      `Bardali item "${item.name}" price ${item.price} is not a multiple of 5 (user rounding rule)`
    );
  }
});

assert.strictEqual(supplierCounts.chillpill, 13, 'Expected 13 ChillPill items');
assert.strictEqual(supplierCounts.bros_burger, 69, 'Expected 69 Bro\'s Burger items');
assert.strictEqual(supplierCounts.bardali, 198, 'Expected 198 Bardali items');

// 3. Migration SQL assertions
assert.ok(migrationSql.includes('20261121_revised_menu_items.sql'), 'Migration header missing');
assert.ok(migrationSql.includes('insert into public.menu_items'), 'Migration insert missing');
assert.ok(migrationSql.includes('update public.menu_items existing'), 'Migration update missing');
assert.ok(migrationSql.includes('Olmeca Tequila (Bottle)'), 'Migration missing sample item');

// 4. Schema SQL seed assertions
assert.ok(schemaSql.includes('Seed revised menu items if empty'), 'Schema seed comment missing');
assert.ok(schemaSql.includes('Thali, Sekuwa & Platters'), 'Schema seed category missing');

// 5. HTML files include menu-defaults.js
[
  { name: 'dashboard.html', content: dashboardHtml },
  { name: 'admin.html', content: adminHtml },
  { name: 'staff.html', content: staffHtml },
  { name: 'index.html', content: indexHtml }
].forEach(({ name, content }) => {
  assert.ok(
    content.includes('assets/js/menu-defaults.js'),
    `Expected ${name} to include assets/js/menu-defaults.js`
  );
});

console.log('Passed: 280 revised menu items validated (ChillPill: 13, Bro\'s Burger: 69, Bardali: 198 with 0/5 clean rounding), migration SQL, schema seed, dashboard synchronization, and site fallback.');
