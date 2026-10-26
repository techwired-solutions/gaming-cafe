const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/dashboard.js', 'utf8');
const code = source.slice(source.indexOf('  function stationDate('), source.indexOf('  function renderStationTimers('));
let now = Date.parse('2026-10-26T10:00:00Z');
let fail = false;
let writes = [];
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
const context = vm.createContext({ Date: Clock, stations: [], sdkReady: true, pauseTarget: null,
  window: { sb: { from: () => ({ update: payload => ({ eq: async () => { writes.push(payload); return { error: fail ? new Error('Save failed') : null }; } }) }) } },
  closePauseModal() {}, renderAllLists() {}, updateStationCards() {}, showToast() {}, overdueToasted: new Set() });
vm.runInContext(code, context);
const fresh = () => ({ id: 'test', status: 'Active', station_name: 'Station 1', start_time: '2026-10-26T09:30:00Z', end_time: '2026-10-26T10:30:00Z', duration_minutes: 60, rate: 100, notes: '', extra_stations: [{ station: 'Station 2', start_time: '2026-10-26T09:45:00Z', end_time: '2026-10-26T10:45:00Z', duration_minutes: 60, rate: 200 }] });
(async () => {
  const r = fresh();
  assert.equal(await context.pauseStation(r, 'Station 2'), true);
  assert.equal(context.isStationPaused(r, 'Station 1'), false);
  assert.equal(context.getSessionPauseInfo(r).isPaused, false);
  assert.equal(context.getStationPauseInfo(r, 'Station 2').remainingMs, 45 * 60000);
  const reloaded = JSON.parse(JSON.stringify(r));
  now += 10 * 60000;
  await context.pauseStation(reloaded, 'all');
  assert.equal(context.getStationPauseInfo(reloaded, 'Station 2').remainingMs, 45 * 60000);
  assert.equal(context.getStationPauseInfo(reloaded, 'Station 1').remainingMs, 20 * 60000);
  now += 5 * 60000;
  await context.resumeStation(reloaded, 'all');
  assert.equal(reloaded.end_time, '2026-10-26T10:35:00.000Z');
  assert.equal(reloaded.extra_stations[0].end_time, '2026-10-26T11:00:00.000Z');
  assert.equal(context.isAnyStationPaused(reloaded), false);
  await context.pauseStation(reloaded, 'Station 1');
  now += 5 * 60000;
  await context.resumeStation(reloaded, 'Station 1');
  assert.equal(reloaded.end_time, '2026-10-26T10:40:00.000Z');
  const before = JSON.stringify(reloaded);
  fail = true;
  assert.equal(await context.pauseStation(reloaded, 'Station 2'), false);
  assert.equal(JSON.stringify(reloaded), before);
  fail = false;
  const legacy = fresh();
  legacy.notes = '[Session: Paused | At: 2026-10-26T10:00:00Z | RemainingMs: 1800000 | Reason: Power cut]';
  await context.resumeStation(legacy, 'Station 2');
  assert.equal(context.isStationPaused(legacy, 'Station 1'), true);
  assert.equal(context.isStationPaused(legacy, 'Station 2'), false);
  assert.equal(legacy.extra_stations[0].end_time, '2026-10-26T11:05:00.000Z');
  const overnight = fresh();
  overnight.extra_stations[0].start_time = '23:30';
  overnight.extra_stations[0].end_time = '00:30';
  const slot = context.getRecordStations(overnight)[1];
  assert.equal(new Date(slot.end_time) - new Date(slot.start_time), 3600000);
  // Exercise the manager's actions through its actual click handlers.
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', disabled: false, textContent: '', innerHTML: '', handlers: {},
      classList: { add() {}, remove() {} },
      addEventListener(event, handler) { this.handlers[event] = handler; },
      querySelectorAll() { return []; }
    });
    return elements.get(id);
  };
  const modal = element('session-pause-modal');
  let selected = ['Station 2'];
  element('pause-modal-station-options').querySelectorAll = () => selected.map(value => ({ value, checked: true, addEventListener() {} }));
  modal.querySelector = () => ({ value: selected });
  const preset = element('preset'); preset.dataset = { reason: 'Power Cut' };
  modal.querySelectorAll = () => [preset];
  context.document = { getElementById: element };
  context.escapeHtml = value => value;
  context.pauseTargetStation = 'all';
  vm.runInContext(source.slice(source.indexOf('  function openPauseModal('), source.indexOf('  function computeOvertimeCharge(')), context);
  context.initPauseModal();
  const managed = fresh();
  context.openPauseModal(managed);
  await element('pause-modal-confirm').handlers.click();
  assert.equal(context.isStationPaused(managed, 'Station 2'), true);
  assert.equal(context.pauseTarget, managed);
  selected = ['Station 1'];
  preset.handlers.click();
  assert.equal(context.isStationPaused(managed, 'Station 1'), false);
  await element('pause-modal-confirm').handlers.click();
  assert.equal(context.isAllStationsPaused(managed), true);
  selected = ['Station 2'];
  await element('pause-modal-resume').handlers.click();
  assert.equal(context.isStationPaused(managed, 'Station 2'), false);
  assert.equal(context.isStationPaused(managed, 'Station 1'), true);
  const third = { ...managed.extra_stations[0], station: 'Station 3', is_paused: false };
  managed.extra_stations.push(third);
  selected = ['Station 1', 'Station 2'];
  let writeCount = writes.length;
  await element('pause-modal-confirm').handlers.click();
  assert.equal(writes.length, writeCount + 1);
  assert.equal(context.isStationPaused(managed, 'Station 1'), true);
  assert.equal(context.isStationPaused(managed, 'Station 2'), true);
  assert.equal(context.isStationPaused(managed, 'Station 3'), false);
  writeCount = writes.length;
  await element('pause-modal-resume').handlers.click();
  assert.equal(writes.length, writeCount + 1);
  assert.equal(context.isStationPaused(managed, 'Station 1'), false);
  assert.equal(context.isStationPaused(managed, 'Station 2'), false);
  selected = [];
  writeCount = writes.length;
  await element('pause-modal-confirm').handlers.click();
  assert.equal(writes.length, writeCount);
  selected = ['Station 1', 'Station 2'];
  fail = true;
  const beforeBatch = JSON.stringify(managed);
  await element('pause-modal-confirm').handlers.click();
  assert.equal(JSON.stringify(managed), beforeBatch);
  fail = false;
  // Complete two slots, keep a third running, and free both for new bookings.
  const completing = fresh();
  completing.extra_stations.push({ ...completing.extra_stations[0], station: 'Racing Simulator' });
  const originalAmount = completing.amount = 500;
  await context.pauseStation(completing, 'Racing Simulator');
  context.records = [completing];
  vm.runInContext(source.slice(source.indexOf('  function splitStationNames('), source.indexOf('  function getRecordPaymentBreakdown(')), context);
  assert.equal(context.sessionUsesStation(completing, 'Racing Simulator'), true);
  assert.equal(context.findActiveStationConflict('Station 2'), completing);
  selected = ['Station 1', 'Racing Simulator'];
  context.openPauseModal(completing, selected);
  writeCount = writes.length;
  await element('pause-modal-complete').handlers.click();
  assert.equal(writes.length, writeCount + 1);
  assert.equal(completing.status, 'Active');
  assert.equal(completing.amount, originalAmount);
  assert.equal(context.isStationCompleted(completing, 'Station 1'), true);
  assert.equal(context.isStationCompleted(completing, 'Racing Simulator'), true);
  assert.equal(context.isStationCompleted(completing, 'Station 2'), false);
  assert.equal(context.isStationPaused(completing, 'Racing Simulator'), false);
  assert.equal(context.findActiveStationConflict('Station 1'), null);
  assert.equal(context.findActiveStationConflict('Racing Simulator'), null);
  assert.equal(context.findActiveStationConflict('Station 2'), completing);
  const candidateStart = new Date(now), candidateEnd = new Date(now + 3600000);
  assert.equal(context.findStationTimeOverlap('Station 1', candidateStart, candidateEnd), null);
  assert.equal(context.findStationTimeOverlap('Station 2', candidateStart, candidateEnd), completing);
  const loaded = JSON.parse(JSON.stringify(completing));
  assert.equal(context.isStationCompleted(loaded, 'Station 1'), true);
  assert.equal(await context.pauseStation(loaded, 'Station 1'), false);
  context.OVERTIME_GRACE_MINUTES = 5;
  vm.runInContext(source.slice(source.indexOf('  function computeOvertimeCharge('), source.indexOf('  function updateCard(')), context);
  const frozenOvertime = context.computeOvertimeCharge(loaded, 'Station 1').amount;
  now += 120 * 60000;
  assert.equal(context.computeOvertimeCharge(loaded, 'Station 1').amount, frozenOvertime);
  const beforeCompleteFailure = JSON.stringify(loaded);
  fail = true;
  assert.equal(await context.completeStations(loaded, ['Station 2']), false);
  assert.equal(JSON.stringify(loaded), beforeCompleteFailure);
  fail = false;
  await context.completeStations(loaded, ['Station 2']);
  assert.equal(context.findActiveStationConflict('Station 2'), completing);
  assert.equal(context.sessionUsesStation(loaded, 'Station 2'), false);
  assert.equal(loaded.status, 'Active');
  // Run edit-form station buttons for both staff roles, preserving draft fields.
  function node() {
    return { children: [], value: '', disabled: false, attrs: {},
      classList: { toggle() {}, add() {}, remove() {} },
      append(...children) { this.children.push(...children); },
      setAttribute(key, value) { this.attrs[key] = value; },
      set innerHTML(value) { this.children = []; },
      get innerHTML() { return ''; }
    };
  }
  context.document.createElement = node;
  context.fmtTime = value => new Date(value).toISOString();
  context.inr = value => String(value);
  context.timeInputValue = value => new Date(value).toISOString().slice(11, 16);
  vm.runInContext(source.slice(source.indexOf('  function renderStationTimers('), source.indexOf('  function openPauseModal(')), context);
  for (const role of ['admin', 'staff']) {
    context.currentStaff = { role };
    const editRecord = fresh();
    editRecord.end_time = new Date(now + 3600000).toISOString();
    const container = node();
    element('edit-notes').value = 'Unsaved customer request';
    element('edit-customer-name').value = 'Unsaved customer name';
    const clickButton = async label => {
      const button = container.children.flatMap(row => row.children).find(child => child.attrs?.['aria-label'] === label);
      assert.ok(button, role + ' can use ' + label);
      await button.onclick();
    };
    context.renderStationTimers(container, editRecord, true);
    await clickButton('Pause Station 1');
    assert.equal(context.isStationPaused(editRecord, 'Station 1'), true);
    assert.ok(element('edit-notes').value.includes('Unsaved customer request'));
    assert.ok(element('edit-notes').value.includes('[Station Paused: Station 1'));
    assert.equal(element('edit-customer-name').value, 'Unsaved customer name');
    now += 60000;
    await clickButton('Resume Station 1');
    assert.equal(context.isStationPaused(editRecord, 'Station 1'), false);
    await clickButton('Complete Station 2');
    assert.equal(context.isStationCompleted(editRecord, 'Station 2'), true);
    assert.ok(element('edit-notes').value.includes('[Station Completed: Station 2'));
  }
  console.log('Passed: admin/staff edit buttons pause, resume and complete stations while preserving unsaved form fields.');
  console.log('Passed: station completion frees availability, retains bill and active stations, survives reload, freezes overtime, and handles save failure.');
  console.log('Passed: multi-selection pause/resume in one write, unselected stations unchanged, empty selection, batch save failure.');
  console.log('Passed: manager selection, pause another station, resume selected station, reason presets, and staying open.');
  console.log('Passed: independent pauses, mixed pause-all, resume-all, primary resume, reload, failed persistence, legacy pauses, and overnight clock times.');
})().catch(error => { console.error(error); process.exitCode = 1; });
