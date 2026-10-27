const {spawn,spawnSync}=require('node:child_process'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const psql=process.env.INVENTORY_TEST_PSQL||'psql',args=['-h','127.0.0.1','-p',process.env.INVENTORY_TEST_PORT||'55439','-U','inventory_test','-d','inventory_schema_test','-v','ON_ERROR_STOP=1','-q','-A','-t'];
const run=sql=>{const r=spawnSync(psql,[...args,'-c',sql],{encoding:'utf8'});if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const suite=spawnSync(psql,[...args,'-f','scripts/test-accounting.sql'],{encoding:'utf8'});if(suite.error)throw suite.error;assert.equal(suite.status,0,suite.stderr);console.log('Passed: accounting migration, balanced journals, staff/admin rules, split-account payments, owner funding, receivables, supplier payments, capex and corrections.');
const admin=randomUUID(),request=randomUUID();let expense;
const pay=()=>new Promise((resolve,reject)=>{const sql=`begin;select public.accounting_pay_expense('${admin}','${expense}',gen_random_uuid(),40,'cash',(now() at time zone 'Asia/Kathmandu')::date,'','Concurrency test');select pg_sleep(0.3);commit;`;const p=spawn(psql,[...args,'-c',sql]);let error='';p.stderr.on('data',chunk=>error+=chunk);p.on('error',reject);p.on('close',code=>resolve({code,error}));});
(async()=>{try{
 run(`insert into public.staff(id,name,username,password_hash,password_salt,role,active) values('${admin}','Accounting concurrency','accounting-${admin}','test','test','admin',true);`);
 expense=run(`select public.accounting_record_expense('${admin}','${request}',jsonb_build_object('title','Concurrency test payable','category','Maintenance','amount',50,'paid_amount',0,'kind','operating','date',(now() at time zone 'Asia/Kathmandu')::date));`);
 const results=await Promise.all([pay(),pay()]);assert.equal(results.filter(r=>r.code===0).length,1);assert.equal(results.filter(r=>r.error.includes('Payment exceeds')).length,1);
 run(`do $$ begin assert (select sum(amount)=40 from public.accounting_expense_payments where expense_id='${expense}' and voided_at is null);assert not exists(select entry_id from public.accounting_lines group by entry_id having sum(debit-credit)<>0);end $$;`);
 console.log('Passed: simultaneous expense payments cannot overpay a payable; every journal remains balanced.');
 }finally{if(expense)run(`select public.accounting_void_expense('${admin}','${expense}','Test cleanup');`);run(`delete from public.staff where id='${admin}';`);}})().catch(error=>{console.error(error);process.exitCode=1;});
