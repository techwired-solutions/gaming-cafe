/* Native inventory UI. Uses the same Supabase client and staff login as the console. */
(function () {
  'use strict';
  let env, items = [], movements = [], ready = false, loading = false, reload = false, historyLimit = 50, busy = false;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const money = value => 'रु ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const isAdmin = () => env?.staff()?.role === 'admin';
  const labels = { opening: 'Opening stock', restock: 'Restock', usage: 'Issue / use', waste: 'Damage / waste', adjustment: 'Stocktake', sale: 'Menu sale', return: 'Return' };
  function summary(list) {
    const active = list.filter(item => item.active);
    return { total: active.length, low: active.filter(item => Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.reorder_level)).length,
      out: active.filter(item => Number(item.quantity) === 0).length, value: active.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost), 0) };
  }
  function filterItems(list, query, category, status) {
    const term = query.trim().toLowerCase();
    return list.filter(item => (!term || [item.name, item.sku, item.supplier].some(value => String(value || '').toLowerCase().includes(term))) &&
      (!category || item.category === category) && (status === 'all' || (status === 'archived' ? !item.active : item.active)) &&
      (status !== 'low' || (Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.reorder_level))) &&
      (status !== 'out' || Number(item.quantity) === 0));
  }
  function status(message, error = false) {
    $('inv-status').hidden = !message;
    $('inv-status').textContent = message;
    $('inv-status').classList.toggle('inv-error', error);
  }
  function preserveOptions(select, options) {
    const previous = select.value;
    select.innerHTML = options;
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }
  function render() {
    const stats = summary(items);
    $('inv-total').textContent = number(stats.total);
    $('inv-low').textContent = number(stats.low);
    $('inv-out').textContent = number(stats.out);
    $('inv-value').textContent = money(stats.value);
    $('inv-add').hidden = !isAdmin();
    preserveOptions($('inv-category-filter'), '<option value="">All categories</option>' + [...new Set(items.map(item => item.category))].sort().map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join(''));
    preserveOptions($('inv-history-filter'), '<option value="">All items</option>' + items.map(item => `<option value="${esc(item.id)}">${esc(item.name)}${item.active ? '' : ' (archived)'}</option>`).join(''));
    const visible = filterItems(items, $('inv-search').value, $('inv-category-filter').value, $('inv-stock-filter').value);
    $('inv-empty').hidden = visible.length > 0;
    $('inv-empty').textContent = items.length ? 'No items match these filters.' : 'No inventory items yet. An admin can add your opening stock.';
    $('inv-items').innerHTML = visible.map(item => {
      const badge = !item.active ? 'Archived' : Number(item.quantity) === 0 ? 'Unavailable' : Number(item.quantity) <= Number(item.reorder_level) ? 'Low stock' : 'In stock';
      const badgeClass = !item.active ? '' : Number(item.quantity) === 0 ? ' inv-badge-out' : Number(item.quantity) <= Number(item.reorder_level) ? ' inv-badge-low' : '';
      const menu = env.menu().find(menuItem => menuItem.id === item.menu_item_id);
      return `<tr><td><strong>${esc(item.name)}</strong><p class="inv-muted text-xs mt-1">${esc(item.category)}${item.sku ? ' · ' + esc(item.sku) : ''}</p>${item.supplier ? `<p class="inv-muted text-xs">${esc(item.supplier)}</p>` : ''}${menu ? `<p class="inv-muted text-xs">Auto stock: ${esc(menu.name)} · ${number(item.units_per_sale)} ${esc(item.unit)} / sale</p>` : ''}</td><td class="mono font-bold whitespace-nowrap">${number(item.quantity)} <span class="text-xs inv-muted">${esc(item.unit)}</span>${item.category === 'Gaming equipment' ? `<p class="text-xs inv-muted font-normal">${number(item.issued_quantity)} issued</p>` : ''}</td><td class="mono">${number(item.reorder_level)}</td><td class="mono whitespace-nowrap">${money(item.unit_cost)}</td><td><span class="inv-badge${badgeClass}">${badge}</span></td><td><div class="flex flex-wrap gap-1">${item.active ? `<button type="button" class="inv-button" data-inv-action="stock" data-id="${esc(item.id)}">${item.category === 'Gaming equipment' ? 'Issue / Return' : 'Update stock'}</button>` : ''}${isAdmin() ? `<button type="button" class="inv-button" data-inv-action="edit" data-id="${esc(item.id)}">Edit</button>` : ''}<button type="button" class="inv-button" data-inv-action="history" data-id="${esc(item.id)}">History</button></div></td></tr>`;
    }).join('');
    $('inv-export').disabled = !ready || !items.length;
    $('inv-add').disabled = !ready;
  }
  function renderHistory() {
    $('inv-history').innerHTML = movements.map(movement => {
      const item = items.find(row => row.id === movement.item_id);
      const date = new Date(movement.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<tr><td class="whitespace-nowrap">${esc(date)}</td><td>${esc(item?.name || 'Inventory item')}</td><td>${esc(labels[movement.movement_type] || movement.movement_type)}</td><td class="mono font-bold">${Number(movement.quantity_change) > 0 ? '+' : ''}${number(movement.quantity_change)} ${esc(item?.unit || '')}</td><td class="mono">${number(movement.balance_after)}</td><td><strong>${esc(movement.staff_name)}</strong><p class="inv-muted mt-1">${esc(movement.reason)}</p></td></tr>`;
    }).join('');
    $('inv-history-empty').hidden = movements.length > 0;
    $('inv-history-more').hidden = movements.length < historyLimit;
  }
  async function loadHistory() {
    const all = [];
    for (let offset = 0; offset < historyLimit; offset += 500) {
      let query = env.db().from('inventory_movements').select('*').order('created_at', { ascending: false }).order('id', { ascending: false });
      if ($('inv-history-filter').value) query = query.eq('item_id', $('inv-history-filter').value);
      const requested = Math.min(500, historyLimit - offset);
      const { data, error } = await query.range(offset, offset + requested - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < requested) break;
    }
    movements = all;
    renderHistory();
  }
  async function load() {
    if (!env?.db() || !env.staff()) return;
    if (loading) { reload = true; return; }
    loading = true;
    try {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await env.db().from('inventory_items').select('*').order('name').order('id').range(offset, offset + 499);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      items = all; ready = true; $('inv-setup').hidden = true; status(''); render(); await loadHistory();
    } catch (error) {
      const missing = ['42P01', 'PGRST205', 'PGRST202'].includes(error.code);
      if (missing) { ready = false; $('inv-setup').hidden = false; status('Inventory database setup is required.'); }
      else status('Could not load inventory: ' + error.message + (items.length ? ' Showing the last loaded stock.' : ''), true);
      $('inv-add').disabled = !ready;
      $('inv-export').disabled = !ready || !items.length;
    } finally {
      loading = false;
      if (reload) { reload = false; load(); }
    }
  }
  function closeModal(id) { if (!busy) { $(id).classList.remove('show'); document.querySelector(`[data-inv-return="${id}"]`)?.focus(); } }
  function showModal(id, trigger) {
    document.querySelectorAll('[data-inv-return]').forEach(button => button.removeAttribute('data-inv-return'));
    trigger?.setAttribute('data-inv-return', id);
    $(id).classList.add('show');
    $(id).querySelector('input:not([type="hidden"]),select,button')?.focus();
  }
  function openItem(item, trigger) {
    if (!ready || !isAdmin()) return;
    $('inv-item-form').reset(); $('inv-item-message').textContent = '';
    $('inv-item-title').textContent = item ? 'Edit inventory item' : 'Add inventory item';
    $('inv-item-id').value = item?.id || '';
    for (const [field, key, fallback] of [['name','name',''],['sku','sku',''],['category','category','Drinks'],['unit','unit','pcs'],['reorder','reorder_level',5],['cost','unit_cost',0],['supplier','supplier',''],['units-per-sale','units_per_sale',1]]) $('inv-' + field).value = item?.[key] ?? fallback;
    $('inv-menu').innerHTML = '<option value="">No link — manage stock manually</option>' + env.menu().map(menuItem => `<option value="${esc(menuItem.id)}">${esc(menuItem.name)} (${esc(menuItem.supplier || 'chillpill')})</option>`).join('');
    $('inv-menu').value = item?.menu_item_id || '';
    $('inv-opening-wrap').hidden = !!item; $('inv-opening').disabled = !!item;
    $('inv-active-wrap').hidden = !item; $('inv-active').checked = item?.active ?? true;
    showModal('inv-item-modal', trigger);
  }
  function moveType() {
    const type = $('inv-move-type').value;
    $('inv-move-qty-label').textContent = type === 'adjustment' ? 'Actual available count (sets the balance)' : ['usage', 'waste'].includes(type) ? 'Quantity to remove / issue' : 'Quantity to add / return';
    $('inv-move-qty').min = type === 'adjustment' ? '0' : '0.001';
    $('inv-move-cost-wrap').hidden = type !== 'restock';
    $('inv-move-cost').disabled = type !== 'restock';
  }
  function openMovement(item, trigger) {
    if (!ready || !item.active) return;
    $('inv-move-form').reset(); $('inv-move-message').textContent = '';
    $('inv-move-item').value = item.id; $('inv-move-title').textContent = item.name;
    $('inv-move-balance').textContent = 'Available: ' + number(item.quantity) + ' ' + item.unit + (item.category === 'Gaming equipment' ? ' · Issued: ' + number(item.issued_quantity) : '');
    $('inv-move-type').value = item.category === 'Gaming equipment' ? 'usage' : 'restock';
    $('inv-move-cost').value = item.unit_cost;
    moveType(); showModal('inv-move-modal', trigger);
  }
  async function saveItem(event) {
    event.preventDefault(); if (busy || !isAdmin() || !ready) return;
    busy = true; $('inv-item-save').disabled = true; $('inv-item-message').textContent = '';
    try {
      const item = { id: $('inv-item-id').value || null, name: $('inv-name').value.trim(), sku: $('inv-sku').value.trim(), category: $('inv-category').value, unit: $('inv-unit').value.trim(),
        opening_stock: Number($('inv-opening').value), reorder_level: Number($('inv-reorder').value), unit_cost: Number($('inv-cost').value), supplier: $('inv-supplier').value.trim(),
        menu_item_id: $('inv-menu').value || null, units_per_sale: Number($('inv-units-per-sale').value), active: $('inv-active').checked };
      if (!item.name || !item.unit) throw new Error('Name and unit are required.');
      if (item.category === 'Gaming equipment' && item.menu_item_id) throw new Error('Use Issue / Return for gaming equipment instead of linking it to a menu sale.');
      const { error } = await env.db().rpc('inventory_save_item', { p_staff_id: env.staff().id, p_item: item });
      if (error) throw error;
      $('inv-item-modal').classList.remove('show'); await load(); env.toast('Inventory item saved.');
    } catch (error) { $('inv-item-message').textContent = error.message; }
    finally { busy = false; $('inv-item-save').disabled = false; }
  }
  async function saveMovement(event) {
    event.preventDefault(); if (busy || !ready || !env.staff()) return;
    busy = true; $('inv-move-save').disabled = true; $('inv-move-message').textContent = '';
    try {
      const { error } = await env.db().rpc('inventory_adjust_stock', { p_staff_id: env.staff().id, p_item_id: $('inv-move-item').value,
        p_type: $('inv-move-type').value, p_quantity: Number($('inv-move-qty').value), p_reason: $('inv-move-reason').value.trim(),
        p_unit_cost: $('inv-move-type').value === 'restock' ? Number($('inv-move-cost').value) : null });
      if (error) throw error;
      $('inv-move-modal').classList.remove('show'); await load(); env.toast('Stock movement recorded.');
    } catch (error) { $('inv-move-message').textContent = error.message; }
    finally { busy = false; $('inv-move-save').disabled = false; }
  }
  function exportStock() {
    const visible = filterItems(items, $('inv-search').value, $('inv-category-filter').value, $('inv-stock-filter').value);
    // Neutralize spreadsheet formula prefixes in user-entered text.
    const cell = value => '"' + String(typeof value === 'number' ? value : /^[=+@\-\t\r]/.test(String(value || '')) ? "'" + value : value ?? '').replace(/"/g, '""') + '"';
    const rows = [['Name','SKU','Category','Unit','Available quantity','Reorder level','Unit cost NPR','Supplier','Active'], ...visible.map(item => [item.name,item.sku,item.category,item.unit,Number(item.quantity),Number(item.reorder_level),Number(item.unit_cost),item.supplier,item.active ? 'Yes' : 'No'])];
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'chillpill-inventory.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function init(options) {
    if (env) return; env = options;
    $('inv-add').hidden = !isAdmin(); $('inv-add').disabled = true; $('inv-export').disabled = true;
    $('inv-refresh').addEventListener('click', load);
    $('inv-export').addEventListener('click', exportStock);
    $('inv-add').addEventListener('click', event => openItem(null, event.currentTarget));
    $('inv-search').addEventListener('input', render);
    ['inv-category-filter','inv-stock-filter'].forEach(id => $(id).addEventListener('change', render));
    $('inv-history-filter').addEventListener('change', async () => { historyLimit = 50; try { await loadHistory(); } catch (error) { status(error.message, true); } });
    $('inv-history-more').addEventListener('click', async () => { historyLimit += 50; try { await loadHistory(); } catch (error) { status(error.message, true); } });
    $('inv-items').addEventListener('click', async event => {
      const button = event.target.closest('button[data-inv-action]'); if (!button) return;
      const item = items.find(row => row.id === button.dataset.id); if (!item) return;
      if (button.dataset.invAction === 'edit') openItem(item, button);
      else if (button.dataset.invAction === 'stock') openMovement(item, button);
      else { $('inv-history-filter').value = item.id; historyLimit = 50; try { await loadHistory(); $('inv-history-filter').scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (error) { status(error.message, true); } }
    });
    $('inv-item-form').addEventListener('submit', saveItem);
    $('inv-move-form').addEventListener('submit', saveMovement);
    $('inv-move-type').addEventListener('change', moveType);
    document.querySelectorAll('[data-inv-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.invClose)));
    ['inv-item-modal','inv-move-modal'].forEach(id => $(id).addEventListener('click', event => { if (event.target === $(id)) closeModal(id); }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') ['inv-item-modal','inv-move-modal'].forEach(id => closeModal(id)); });
    $('inv-copy-setup').addEventListener('click', async () => {
      try { const response = await fetch('supabase/migrations/20261026_inventory.sql'); if (!response.ok) throw new Error('Download failed'); await navigator.clipboard.writeText(await response.text()); env.toast('Setup SQL copied. Paste it into Supabase SQL Editor.'); }
      catch (error) { status('Could not copy setup SQL. Use the download link instead.', true); }
    });
  }
  window.ChillPillInventory = { init, load, summary, filterItems, refreshMenu: () => { if (env && ready) render(); } };
})();
