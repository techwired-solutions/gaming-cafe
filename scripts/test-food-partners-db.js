const {spawn,spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const psql=process.env.INVENTORY_TEST_PSQL||'psql',args=['-h','127.0.0.1','-p',process.env.INVENTORY_TEST_PORT||'55439','-U','inventory_test','-d','inventory_schema_test','-v','ON_ERROR_STOP=1','-q'];
const run=sql=>{const r=spawnSync(psql,[...args,'-c',sql],{encoding:'utf8'});if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);return r.stdout;};
const suite=spawnSync(psql,[...args,'-f','scripts/test-food-partners.sql'],{encoding:'utf8'});if(suite.error)throw suite.error;assert.equal(suite.status,0,suite.stderr);
console.log('Passed: migration re-run, actual bills, partial/full payments, retries, admin permissions, expense integrity, corrections and legacy payout linking.');
const admin='00000000-0000-0000-0000-000000008101',bill='00000000-0000-0000-0000-000000008102';
const pay=()=>new Promise((resolve,reject)=>{const c=spawn(psql,[...args,'-c',`begin;select public.food_partner_record_payment('${admin}','${bill}',gen_random_uuid(),40,'Cash','2026-10-26','Concurrent payment');select pg_sleep(0.3);commit;`]);let error='';c.stderr.on('data',part=>error+=part);c.on('error',reject);c.on('close',code=>resolve({code,error}));});
(async()=>{try{
 run(`insert into public.staff(id,name,username,password_hash,password_salt,role,active) values('${admin}','Food bill test','food-bill-concurrency','test','test','admin',true);insert into public.food_partner_bills(id,supplier_key,business_date,amount,created_by) values('${bill}','test_concurrent','2099-01-01',50,'${admin}');`);
 const results=await Promise.all([pay(),pay()]);assert.equal(results.filter(r=>r.code===0).length,1);assert.equal(results.filter(r=>r.error.includes('Payment exceeds')).length,1);
 run(`do $$ begin assert (select sum(amount)=40 from public.food_partner_payments where bill_id='${bill}' and voided_at is null);assert (select count(*)=1 from public.expenses where notes like '%[FoodBill: ${bill}]%');end $$;`);
 console.log('Passed: concurrent payouts cannot exceed the bill or create duplicate expense entries.');
 }finally{run(`select public.food_partner_void_payment('${admin}',id,'Test cleanup') from public.food_partner_payments where bill_id='${bill}' and voided_at is null;delete from public.food_partner_payments where bill_id='${bill}';delete from public.food_partner_bill_revisions where bill_id='${bill}';delete from public.food_partner_bills where id='${bill}';delete from public.staff where id='${admin}';`);}})().catch(error=>{console.error(error);process.exitCode=1;});
