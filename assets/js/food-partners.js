/* Source/day bill and settlement UI, using the dashboard's existing staff login. */
(function(){
 'use strict';
 let env,bills=[],payments=[],cache=null,ready=false,loading=false,queued=false,editing=null,paying=null,operation=null,busy=false;
 const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>'रु '+new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Number(n)||0);
 const names={chillpill:'ChillPill Own Food',bros_burger:"Bro's Burger",bardali:'Bardali'},name=key=>names[key]||key;
 const today=()=>window.FoodPartnerMath.day(new Date());
 function sourceKeys(){return [...new Set(['chillpill','bros_burger','bardali',...env.menu().map(m=>m.supplier||'chillpill'),...state().days.map(g=>g.source)])];}
 function state(){if(!cache)cache=window.FoodPartnerMath.calculate(env.records(),bills,payments,env.menu(),env.breakdown);return cache;}
 function forRecord(record){
  const actual=env.records().find(r=>r.id===record.id);
  const result=actual===record ? state().byRecord.get(record.id) : window.FoodPartnerMath.calculate([...env.records().filter(r=>r.id!==record.id),record],bills,payments,env.menu(),env.breakdown).byRecord.get(record.id);
  return result || {grossAmount:0,timeRevenue:0,foodTotal:0,chillpillFood:0,brosGross:0,brosCommission:0,brosPayable:0,bardaliGross:0,bardaliCommission:0,bardaliPayable:0,otherFoodGross:0,otherFoodCommission:0,otherFoodPayable:0,netFoodRevenue:0,netRevenue:0};
 }
 function refresh(){if(!env)return;cache=null;render();}
 function revenueRecords(){return env.records().filter(r=>{const v=state().byRecord.get(r.id);return v && (v.grossAmount>0 || v.partnerCost>0);});}
 function status(text,error=false){$('fp-status').hidden=!text;$('fp-status').textContent=text;$('fp-status').classList.toggle('inv-error',error);}
 function selectedDays(){const from=$('fp-start').value,to=$('fp-end').value,source=$('fp-source-filter').value;return state().days.filter(g=>(!from||g.date>=from)&&(!to||g.date<=to)&&(!source||g.source===source));}
 function legacy(source){return env.expenses().filter(e=>(!source||(e.notes||'').includes('[Settlement: '+source+']')) && /\[Settlement:\s*[^\]]+\]/.test(e.notes||'') && !payments.some(p=>p.expense_id===e.id));}
 function render(){
  if(!env)return;
  const old=$('fp-source-filter').value;
  $('fp-source-filter').innerHTML='<option value="">All food sources</option>'+sourceKeys().map(key=>`<option value="${esc(key)}">${esc(name(key))}</option>`).join('');$('fp-source-filter').value=old;
  const groups=selectedDays();
  const sources=$('fp-source-filter').value ? [$('fp-source-filter').value] : sourceKeys();
  $('fp-source-cards').innerHTML=sources.map(key=>{const rows=groups.filter(g=>g.source===key),sum=field=>rows.reduce((n,g)=>n+g[field],0),pending=rows.filter(g=>g.pending).length;return `<article class="inv-surface p-4"><h3 class="font-bold">${esc(name(key))}</h3><p class="text-xs inv-muted mt-2">Ordered: ${money(sum('ordered'))} · Collected: ${money(sum('collected'))}</p><p class="mono text-xl font-bold mt-2">${money(sum('net'))}</p><p class="inv-muted text-xs">${key==='chillpill'?'Own food collections before costs':pending?'Confirmed retained earnings; '+pending+' day(s) awaiting bills':'Cafe retained after actual bills'}</p>${key!=='chillpill'?`<p class="text-xs mt-3">Bills: ${money(rows.filter(g=>g.bill).reduce((n,g)=>n+g.cost,0))}<br>Paid: ${money(sum('paid'))} · Due: ${money(sum('outstanding'))}</p>`:''}</article>`;}).join('');
  $('fp-empty').hidden=groups.length>0;
  $('fp-days').innerHTML=[...groups].sort((a,b)=>b.date.localeCompare(a.date)||a.source.localeCompare(b.source)).map(g=>`<tr><td>${esc(g.date)}<br><strong>${esc(name(g.source))}</strong>${g.changed?'<p class="inv-error text-xs">Orders changed since bill was recorded. Review bill.</p>':''}</td><td>${money(g.ordered)}</td><td>${money(g.collected)}</td><td>${g.source==='chillpill'?'—':g.bill?money(g.cost):'<span class="inv-badge inv-badge-low">Awaiting bill</span>'}</td><td>${g.pending?'Pending bill':money(g.net)}</td><td>${g.source==='chillpill'?'—':g.bill?`${money(g.paid)} paid<br>${money(g.outstanding)} due<br><span class="inv-badge">${g.outstanding===0?'Paid':g.paid?'Part-paid':'Unpaid'}</span>`:'—'}</td><td>${g.source!=='chillpill'?`<div class="flex flex-wrap gap-1"><button type="button" class="inv-button" data-fp-action="bill" data-source="${esc(g.source)}" data-date="${g.date}" ${!ready?'disabled':''}>${g.bill?'Edit bill':'Add bill'}</button>${g.bill&&g.outstanding>0?`<button type="button" class="inv-button" data-fp-action="pay" data-bill="${g.bill.id}" ${!ready?'disabled':''}>Record payment</button>`:''}</div>`:'Own food'}</td></tr>`).join('');
  $('fp-orders').innerHTML=groups.flatMap(g=>g.lines.map(line=>`<tr><td>${g.date}<br>${esc(name(g.source))}</td><td>${esc(line.customer)}</td><td>${esc(line.name)}</td><td>${line.qty}</td><td>${money(line.amount)}</td><td>${money(line.collected)}</td></tr>`)).join('')||'<tr><td colspan="6" class="inv-muted">No food items in this period.</td></tr>';
  const included=new Set(groups.filter(g=>g.bill).map(g=>g.bill.id));
  $('fp-payments').innerHTML=payments.filter(p=>included.has(p.bill_id)).map(p=>{const b=bills.find(b=>b.id===p.bill_id);return `<tr><td>${b.business_date}<br>${esc(name(b.supplier_key))}</td><td>${p.payment_date}</td><td>${money(p.amount)}</td><td>${esc(p.method)}<br>${esc(p.reference)}</td><td>${esc(p.staff_name)}</td><td>${p.voided_at?`Voided: ${esc(p.void_reason)}`:`Paid <button type="button" class="inv-button" data-fp-action="void" data-payment="${p.id}">Correct</button>`}</td></tr>`;}).join('')||'<tr><td colspan="6" class="inv-muted">No recorded payments for these bills.</td></tr>';
  $('fp-legacy').innerHTML=legacy($('fp-source-filter').value||null).map(e=>`<p class="py-2">${esc(e.date||(e.expense_date||'').slice(0,10))} · ${esc(e.title)} · ${money(e.amount)}</p>`).join('')||'<p class="inv-muted">No unlinked historical supplier payouts.</p>';
  $('fp-new-bill').disabled=!ready;
 }
 async function fetchAll(table){const rows=[];for(let offset=0;;offset+=500){const {data,error}=await env.db().from(table).select('*').order('id').range(offset,offset+499);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<500)return rows;}}
 async function load(){
  if(!env?.db()||!env.staff()||env.staff().role!=='admin')return;
  if(loading){queued=true;return;}loading=true;
  try{const results=await Promise.all([fetchAll('food_partner_bills'),fetchAll('food_partner_payments')]);[bills,payments]=results;ready=true;$('fp-setup').hidden=true;status('');refresh();env.changed();}
  catch(error){if(['42P01','PGRST205','PGRST202'].includes(error.code)){ready=false;$('fp-setup').hidden=false;status('Daily bill setup is required. Food orders remain available below.');}else status('Could not load food bills: '+error.message,true);refresh();}
  finally{loading=false;if(queued){queued=false;load();}}
 }
 function openBill(source,date){
  if(!ready)return;
  $('fp-bill-form').reset();editing=bills.find(b=>b.supplier_key===source&&b.business_date===date)||null;
  $('fp-bill-source').innerHTML=sourceKeys().filter(key=>key!=='chillpill').map(key=>`<option value="${esc(key)}">${esc(name(key))}</option>`).join('');
  $('fp-bill-source').value=source||'bros_burger';$('fp-bill-date').value=date||today();$('fp-bill-source').disabled=!!editing;$('fp-bill-date').disabled=!!editing;
  $('fp-bill-title').textContent=editing?'Edit actual supplier bill':'Record actual supplier bill';$('fp-bill-amount').value=editing?.amount??'';$('fp-bill-reference').value=editing?.reference||'';$('fp-bill-notes').value=editing?.notes||'';$('fp-bill-message').textContent='';
  $('fp-bill-form').hidden=false;$('fp-pay-form').hidden=true;$('fp-bill-form').scrollIntoView({behavior:'smooth',block:'center'});$('fp-bill-amount').focus();
 }
 function openPayment(id){
  paying=bills.find(b=>b.id===id);if(!paying||!ready)return;operation=crypto.randomUUID();
  const row=state().days.find(g=>g.bill?.id===id);$('fp-pay-form').reset();$('fp-pay-title').textContent='Pay '+name(paying.supplier_key)+' — '+paying.business_date;$('fp-pay-due').textContent='Actual bill: '+money(paying.amount)+' · Remaining: '+money(row.outstanding);
  $('fp-pay-amount').value=row.outstanding;$('fp-pay-amount').max=row.outstanding;$('fp-pay-amount').readOnly=false;$('fp-pay-date').value=today();$('fp-pay-message').textContent='';
  $('fp-pay-existing').innerHTML='<option value="">New payment — record cafe expense</option>'+legacy(paying.supplier_key).filter(e=>Number(e.amount)<=row.outstanding&&e.payment_source==='cafe_revenue').map(e=>`<option value="${e.id}">${esc(e.date||(e.expense_date||'').slice(0,10))} · ${money(e.amount)} · ${esc(e.title)}</option>`).join('');
  $('fp-pay-form').hidden=false;$('fp-bill-form').hidden=true;$('fp-pay-form').scrollIntoView({behavior:'smooth',block:'center'});
 }
 async function saveBill(event){event.preventDefault();if(busy||!ready)return;busy=true;$('fp-bill-save').disabled=true;
  try{const {error}=await env.db().rpc('food_partner_save_bill',{p_staff_id:env.staff().id,p_supplier:$('fp-bill-source').value,p_date:$('fp-bill-date').value,p_amount:Number($('fp-bill-amount').value),p_reference:$('fp-bill-reference').value.trim(),p_notes:$('fp-bill-notes').value.trim(),p_expected_updated_at:editing?.updated_at||null});if(error)throw error;$('fp-bill-form').hidden=true;await load();env.toast('Actual supplier bill saved.');}
  catch(error){$('fp-bill-message').textContent=error.message;}finally{busy=false;$('fp-bill-save').disabled=false;}}
 async function savePayment(event){event.preventDefault();if(busy||!paying||!ready)return;busy=true;$('fp-pay-save').disabled=true;
  try{const {error}=await env.db().rpc('food_partner_record_payment',{p_staff_id:env.staff().id,p_bill_id:paying.id,p_operation_id:operation,p_amount:Number($('fp-pay-amount').value),p_method:$('fp-pay-method').value,p_date:$('fp-pay-date').value,p_reference:$('fp-pay-reference').value.trim(),p_existing_expense:$('fp-pay-existing').value||null});if(error)throw error;$('fp-pay-form').hidden=true;await Promise.all([load(),env.reloadExpenses()]);env.toast('Partner payment recorded.');}
  catch(error){$('fp-pay-message').textContent=error.message;}finally{busy=false;$('fp-pay-save').disabled=false;}}
 function init(options){if(env)return;env=options;$('fp-start').value=today();$('fp-end').value=today();
  ['fp-start','fp-end','fp-source-filter'].forEach(id=>$(id).addEventListener('change',()=>{if($('fp-start').value&&$('fp-end').value&&$('fp-start').value>$('fp-end').value){status('The end date must be on or after the start date.',true);return;}status('');render();}));
  $('fp-today').addEventListener('click',()=>{$('fp-start').value=today();$('fp-end').value=today();render();});$('fp-all').addEventListener('click',()=>{$('fp-start').value='';$('fp-end').value='';render();});
  $('fp-refresh').addEventListener('click',async()=>{await Promise.all([env.reloadRecords(),env.reloadExpenses(),load()]);});$('fp-new-bill').addEventListener('click',()=>openBill('bros_burger',today()));
  $('fp-bill-form').addEventListener('submit',saveBill);$('fp-pay-form').addEventListener('submit',savePayment);
  $('fp-pay-existing').addEventListener('change',()=>{const e=env.expenses().find(e=>e.id===$('fp-pay-existing').value);$('fp-pay-amount').readOnly=!!e;if(e){$('fp-pay-amount').value=e.amount;$('fp-pay-date').value=e.date||(e.expense_date||'').slice(0,10);}});
  document.querySelectorAll('[data-fp-close]').forEach(button=>button.addEventListener('click',()=>{if(!busy)$(button.dataset.fpClose).hidden=true;}));
  $('page-food-partners').addEventListener('click',async event=>{const button=event.target.closest('button[data-fp-action]');if(!button)return;
   if(button.dataset.fpAction==='bill')openBill(button.dataset.source,button.dataset.date);
   if(button.dataset.fpAction==='pay')openPayment(button.dataset.bill);
   if(button.dataset.fpAction==='void'){const reason=window.prompt('Correct this payment record? Enter the reason. This removes its expense entry; it does not reverse an actual cash or bank transfer.');if(!reason?.trim())return;button.disabled=true;try{const {error}=await env.db().rpc('food_partner_void_payment',{p_staff_id:env.staff().id,p_payment_id:button.dataset.payment,p_reason:reason.trim()});if(error)throw error;await Promise.all([load(),env.reloadExpenses()]);}catch(error){status(error.message,true);}finally{button.disabled=false;}}
  });
  $('fp-copy-sql').addEventListener('click',async()=>{try{const r=await fetch('supabase/migrations/20261026_food_partner_bills.sql');if(!r.ok)throw Error();await navigator.clipboard.writeText(await r.text());env.toast('Partner-bill setup SQL copied.');}catch(error){status('Use the migration download link to open the setup SQL.',true);}});
  render();
 }
 window.FoodPartners={init,load,refresh,forRecord,revenueRecords,days:()=>state().days,ready:()=>ready};
})();
