const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/inventory.js', 'utf8');
const ctx = vm.createContext({ window: {}, Intl });
vm.runInContext(source, ctx);
const { summary, filterItems, getMenuMatches } = ctx.window.ChillPillInventory;
const items = [
  { name: 'Coke', sku: 'DR-1', supplier: 'Local supplier', category: 'Drinks', active: true, quantity: 10, reorder_level: 5, unit_cost: 50 },
  { name: 'Chips', category: 'Snacks', active: true, quantity: 2, reorder_level: 3, unit_cost: 25 },
  { name: 'PS5 controller', category: 'Gaming equipment', active: true, quantity: 0, reorder_level: 1, unit_cost: 9000 },
  { name: 'Old headset', category: 'Gaming equipment', active: false, quantity: 10, reorder_level: 1, unit_cost: 2000 }
];
assert.equal(JSON.stringify(summary(items)), JSON.stringify({ total: 3, low: 1, out: 1, value: 550 }));
assert.equal(filterItems(items, ' dr-1 ', '', 'active')[0].name, 'Coke');
assert.equal(filterItems(items, 'supplier', '', 'active').length, 1);
assert.equal(filterItems(items, '', '', 'low')[0].name, 'Chips');
assert.equal(filterItems(items, '', 'Gaming equipment', 'out')[0].name, 'PS5 controller');
assert.equal(filterItems(items, '', '', 'archived')[0].name, 'Old headset');
assert.equal(filterItems(items, '', '', 'all').length, 4);

// Menu item recommendations
const menuItems = [
  { id: 'm1', name: 'Ice Americano', price: 170, category: 'Beverages - Cold', supplier: 'chillpill' },
  { id: 'm2', name: 'Americano (Hot/Cold)', price: 150, category: 'Beverages - Coffee', supplier: 'chillpill' },
  { id: 'm3', name: 'Coke 250ml', price: 60, category: 'Beverages - Cold', supplier: 'chillpill' },
  { id: 'm4', name: 'Classic Burger', price: 200, category: 'Burgers', supplier: 'bros_burger' },
  { id: 'm5', name: 'French Fries', price: 120, category: 'Snacks', supplier: 'chillpill' }
];
// Empty query should return only ChillPill items
const emptyRecs = getMenuMatches('', menuItems);
assert.equal(emptyRecs.length, 4);
assert.ok(emptyRecs.every(m => m.supplier === 'chillpill'));

// Typed query 'ame' should match Americano items, starting prefix first
const ameRecs = getMenuMatches('ame', menuItems);
assert.equal(ameRecs.length, 2);
assert.equal(ameRecs[0].name, 'Americano (Hot/Cold)');
assert.equal(ameRecs[1].name, 'Ice Americano');

// Typed query 'burg' should find partner item
const burgRecs = getMenuMatches('burg', menuItems);
assert.equal(burgRecs.length, 1);
assert.equal(burgRecs[0].name, 'Classic Burger');
const html = fs.readFileSync('dashboard.html', 'utf8');
for (const match of source.matchAll(/\$\('(inv-[a-z-]+)'\)/g)) assert.ok(html.includes(`id="${match[1]}"`), `Missing UI element ${match[1]}`);
for (const id of [...html.matchAll(/id="(inv-[^"]+)"/g)].map(match => match[1])) assert.equal(html.split(`id="${id}"`).length - 1, 1, `Duplicate element ${id}`);
assert.ok(fs.readFileSync('supabase/schema.sql', 'utf8').includes(fs.readFileSync('supabase/migrations/20261026_inventory.sql', 'utf8').trim()));
console.log('Passed: stock KPIs, equipment/food categories, low/out/archive/search filters, dashboard wiring, and migration parity.');
