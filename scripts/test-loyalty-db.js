const {spawn,spawnSync}=require('node:child_process'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const psql=process.env.INVENTORY_TEST_PSQL||'psql',args=['-h','127.0.0.1','-p',process.env.INVENTORY_TEST_PORT||'55439','-U','inventory_test','-d','inventory_schema_test','-v','ON_ERROR_STOP=1','-q','-A','-t'];
const run=sql=>{const r=spawnSync(psql,[...args,'-c',sql],{encoding:'utf8'});if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const suite=spawnSync(psql,[...args,'-f','scripts/test-loyalty.sql'],{encoding:'utf8'});if(suite.error)throw suite.error;assert.equal(suite.status,0,suite.stderr);console.log(suite.stdout.trim());
const actor=randomUUID(),historical=randomUUID(),first=randomUUID(),second=randomUUID(),phone='981'+String(Date.now()).slice(-7),fixture=[historical,first,second];
const checkout=id=>new Promise((resolve,reject)=>{const command=`begin;select public.loyalty_checkout('${actor}','${id}',jsonb_build_object('status','Completed','amount',50,'paid',true,'payment_method','Cash','cash_amount',50,'online_amount',0,'paid_amount',50,'due_amount',0,'discount_amount',100,'discount_type','amount','discount_value',0,'notes',''),'Loyalty concurrency');select pg_sleep(0.3);commit;`;const child=spawn(psql,[...args,'-c',command]);let error='';child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,error}));});
(async()=>{try{
 run(`insert into public.staff(id,name,username,password_hash,password_salt,role,active) values('${actor}','Loyalty concurrency','loyalty-${actor}','test','test','staff',true);
 insert into public.sessions(id,station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,amount,status) values('${historical}','Loyalty concurrency','Loyalty concurrency','${phone}',now()-interval '2 days',now()-interval '2 days'+interval '10 hours',600,100,1000,'Completed');
 insert into public.sessions(id,station_name,customer_name,customer_phone,start_time,end_time,duration_minutes,rate,food_total,food_items,amount,status) values('${first}','Loyalty concurrency','Loyalty concurrency','${phone}',now()-interval '61 minutes',now()-interval '1 minute',60,100,50,'[{"name":"Meal","price":50,"qty":1}]',150,'Active'),('${second}','Loyalty concurrency','Loyalty concurrency','${phone}',now()-interval '61 minutes',now()-interval '1 minute',60,100,50,'[{"name":"Meal","price":50,"qty":1}]',150,'Active');`);
 // Simulate a completed session that predates the native loyalty tables, then backfill it.
 run(`delete from public.loyalty_visits where session_id='${historical}';`);
 const migration=spawnSync(psql,[...args,'-f','supabase/migrations/20261027_loyalty.sql'],{encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
 assert.equal(run(`select historical from public.loyalty_visits where session_id='${historical}'`),'t');
 assert.equal(run(`select stamps from public.loyalty_visits where session_id='${historical}'`),'10');
 const results=await Promise.all([checkout(first),checkout(second)]);assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));assert.equal(results.filter(r=>r.error.includes('No free-hour reward')).length,1,JSON.stringify(results));
 assert.equal(run(`select count(*) from public.loyalty_rewards where phone='${phone}' and voided_at is null`),'1');
 assert.equal(run(`select count(*) from public.sessions where id in('${first}','${second}') and status='Active'`),'1');
 // Correcting an old award never invents a second reward after the first was spent.
 run(`update public.sessions set duration_minutes=30,end_time=start_time+interval '30 minutes' where id='${historical}';`);
 const balance=JSON.parse(run(`select public.loyalty_balance('${phone}')`));assert.equal(balance.available,0);assert.equal(balance.deficit,9);
 console.log('Passed: concurrent checkouts cannot spend the same reward; losing checkout stays active; corrected stamp deficits block further rewards.');
 }finally{run(`delete from public.sessions where id in(${fixture.map(id=>`'${id}'`).join(',')});delete from public.loyalty_rewards where phone='${phone}';delete from public.staff where id='${actor}';`);}})().catch(error=>{console.error(error);process.exitCode=1;});
