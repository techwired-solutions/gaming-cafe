// Uses ONLY the isolated inventory_test database on loopback, never production.
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const psql = process.env.INVENTORY_TEST_PSQL || 'psql';
const args = ['-h','127.0.0.1','-p',process.env.INVENTORY_TEST_PORT || '55439','-U','inventory_test','-d','inventory_test','-v','ON_ERROR_STOP=1','-q'];
const run = sql => {
  const result = spawnSync(psql, [...args, '-c', sql], { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const migration = spawnSync(psql, [...args, '-f','scripts/test-inventory.sql'], { encoding: 'utf8' });
if (migration.error) throw migration.error;
assert.equal(migration.status, 0, migration.stderr);
console.log('Passed: PostgreSQL migration, re-run safety, sales/returns, stock ledger, equipment, permissions, and historical order tests.');
const staff = '00000000-0000-0000-0000-000000009001';
const item = '00000000-0000-0000-0000-000000009002';
const sql = `begin; select public.inventory_adjust_stock('${staff}','${item}','usage',1,'Concurrent issue test'); select pg_sleep(0.4); commit;`;
function concurrentIssue() {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, [...args,'-c',sql]); let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('close', code => resolve({ code, stderr }));
  });
}
(async () => {
  try {
    run(`insert into public.staff(id,name,active,role) values('${staff}','Inventory test',true,'admin'); insert into public.inventory_items(id,name,quantity) values('${item}','Concurrency fixture',1);`);
    const results = await Promise.all([concurrentIssue(),concurrentIssue()]);
    assert.equal(results.filter(result => result.code === 0).length, 1);
    assert.equal(results.filter(result => result.stderr.includes('Insufficient stock')).length, 1);
    run(`do $$ begin assert (select quantity=0 from public.inventory_items where id='${item}'); assert (select count(*)=1 from public.inventory_movements where item_id='${item}'); end $$;`);
    console.log('Passed: two concurrent issues of the last stock unit produce one successful transaction and one safe rejection.');
  } finally {
    run(`delete from public.inventory_movements where item_id='${item}'; delete from public.inventory_items where id='${item}'; delete from public.staff where id='${staff}';`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
