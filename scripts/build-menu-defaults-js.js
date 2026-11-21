const fs = require('fs');
const path = require('path');

const items = require('../assets/data/revised_menu_items.json');

const content = `(function (root) {
  'use strict';

  // Comprehensive revised menu items combining ChillPill (CP), Bro's Burger Hub (BB), and Bardali Sekuwa & Thali (BD).
  // Bardali food prices have been rounded cleanly to nearest multiple of 5 (ending in 0 or 5).
  // Total items: ${items.length}
  const REVISED_MENU_ITEMS = ${JSON.stringify(items, null, 2)};

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = REVISED_MENU_ITEMS;
  }
  if (root) {
    root.REVISED_MENU_ITEMS = REVISED_MENU_ITEMS;
  }
})(typeof window !== 'undefined' ? window : globalThis);
`;

const targetPath = path.join(__dirname, '..', 'assets', 'js', 'menu-defaults.js');
fs.writeFileSync(targetPath, content, 'utf8');
console.log('Saved assets/js/menu-defaults.js with ' + items.length + ' items.');
