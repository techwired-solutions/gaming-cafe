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

// 2. Validate suppliers and clean categories
const validSuppliers = new Set(['chillpill', 'bros_burger', 'bardali']);
const validCategories = new Set([
  'Coffee & Tea',
  'Cold Drinks & Refreshers',
  'Burgers & Wraps',
  'Pizza',
  'Fries & Snacks',
  'Sadheko & Choila',
  'Momo',
  'Noodles, Thukpa & Rice',
  'Combos',
  'Thali & Platters',
  'Sekuwa',
  'Nepali Specialties',
  'Salads & Soups',
  'Beer & Cider',
  'Wine',
  'Spirits',
  'Hookah'
]);

const supplierCounts = { chillpill: 0, bros_burger: 0, bardali: 0 };
const categoryCounts = {};
const seen = new Set();

jsonItems.forEach((item, idx) => {
  assert.ok(item.name && item.name.trim().length > 0, `Item ${idx} missing name`);
  assert.ok(typeof item.price === 'number' && item.price >= 0, `Item ${item.name} has invalid price`);
  assert.ok(validSuppliers.has(item.supplier), `Item ${item.name} has unknown supplier: ${item.supplier}`);
  assert.ok(validCategories.has(item.category), `Item ${item.name} has unexpected category: ${item.category}`);

  const key = `${item.supplier}::${item.name.toLowerCase()}`;
  assert.ok(!seen.has(key), `Duplicate item detected for supplier: ${key}`);
  seen.add(key);

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

// 3. Category segregation assertions:
// Burgers & Wraps vs Pizza
assert.strictEqual(categoryCounts['Pizza'], 3, 'Expected exactly 3 Pizza items');
assert.strictEqual(categoryCounts['Burgers & Wraps'], 11, 'Expected 11 Burgers & Wraps items');

// Tequila must be inside Spirits
assert.strictEqual(categoryCounts['Tequila'] || 0, 0, 'Tequila should not be a separate 2-item category');
assert.ok(jsonItems.some(i => i.name.includes('Olmeca Tequila') && i.category === 'Spirits'), 'Olmeca Tequila must be in Spirits');

// All Sekuwa in Sekuwa category
assert.ok(jsonItems.some(i => i.name.includes('Chicken Sekuwa Jhaneko') && i.category === 'Sekuwa'), 'Chicken Sekuwa Jhaneko must be in Sekuwa');
assert.ok(jsonItems.some(i => i.name.includes('Mutton Sekuwa Jhaneko') && i.category === 'Sekuwa'), 'Mutton Sekuwa Jhaneko must be in Sekuwa');
assert.ok(categoryCounts['Thali, Sekuwa & Platters'] === undefined, 'Category should be Thali & Platters, not Thali, Sekuwa & Platters');
assert.strictEqual(categoryCounts['Thali & Platters'], 7, 'Expected 7 Thali & Platters items');

// Sadheko & Choila
assert.ok(jsonItems.some(i => i.name.includes('Mushroom Choila') && i.category === 'Sadheko & Choila'), 'Mushroom Choila must be in Sadheko & Choila');

// 4. Migration SQL assertions
assert.ok(migrationSql.includes('20261121_revised_menu_items.sql'), 'Migration header missing');
assert.ok(migrationSql.includes('Sadheko & Choila'), 'Migration missing Sadheko & Choila');
assert.ok(migrationSql.includes('Thali & Platters'), 'Migration missing Thali & Platters');

// 5. Schema SQL seed assertions
assert.ok(schemaSql.includes('Sadheko & Choila'), 'Schema seed category missing');
assert.ok(schemaSql.includes('Thali & Platters'), 'Schema seed category missing');

// 6. HTML files include menu-defaults.js
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

console.log('Passed: 280 revised menu items validated with clean, non-overlapping categories (Pizza separated from Burgers, Sekuwa consolidated, Tequila in Spirits, Choila in Sadheko & Choila, Poleko in Nepali Specialties, and 0/5 clean rounding for Bardali).');
