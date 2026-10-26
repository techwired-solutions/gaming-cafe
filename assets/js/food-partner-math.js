/* Actual-bill food accounting. All monetary allocations use integer paisa. */
(function(root) {
  'use strict';
  const cents = value => Math.round((Number(value) || 0) * 100);
  const day = value => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  };
  function allocate(total, weights) {
    const sum = weights.reduce((a,b) => a+b,0);
    if (!sum) return weights.map(() => 0);
    const shares = weights.map(weight => Math.floor(total * weight / sum));
    const ranked = weights.map((weight,i) => ({ i, remainder: total * weight / sum - shares[i] })).sort((a,b) => b.remainder-a.remainder || a.i-b.i);
    for (let i=0, remaining=total-shares.reduce((a,b)=>a+b,0); i<remaining; i++) shares[ranked[i % ranked.length].i]++;
    return shares;
  }
  function calculate(records, bills, payments, menu, breakdown) {
    const groups = new Map(), byRecord = new Map();
    const group = (date, source) => {
      const key = date+'|'+source;
      if (!groups.has(key)) groups.set(key, { date, source, ordered:0, collected:0, lines:[], entries:[], bill:null, paid:0, cost:0, net:0, outstanding:0, pending:true });
      return groups.get(key);
    };
    for (const record of records) {
      if (record.status==='Cancelled') continue;
      const date = day(record.start_time || record.created_at || record.paid_at); if (!date) continue;
      const lines = [];
      for (const item of Array.isArray(record.food_items) ? record.food_items : []) {
        if (!item || item.id==='_extra_ctrl' || item.name==='Item') continue;
        const qty=Math.max(0,Number(item.qty)||0), amount=cents(Math.max(0,Number(item.price)||0)*qty);
        if (!qty) continue;
        const explicitSource=item.supplier || item.source;
        const match=menu.find(m=>m.id===item.id) || menu.find(m=>item.name && m.name.toLowerCase()===item.name.toLowerCase() && (!explicitSource || (m.supplier || 'chillpill')===explicitSource));
        const savedRate=item.menu_price != null && item.menu_price !== '' && Number.isFinite(Number(item.menu_price)) ? Math.max(0,Number(item.menu_price)) : null;
        const customerRate=Math.max(0,Number(item.price)||0);
        const currentRate=match?.price != null && match.price !== '' && Number.isFinite(Number(match.price)) ? Math.max(0,Number(match.price)) : null;
        const menuRate=savedRate ?? currentRate ?? customerRate;
        lines.push({ menuRate, customerRate, menuRateSource:savedRate != null ? 'saved' : currentRate != null ? 'current' : 'customer', rateChange:menuRate == null ? null : customerRate-menuRate, menuValue:menuRate == null ? null : Math.round(menuRate*qty*100)/100, source:item.supplier || item.source || match?.supplier || 'chillpill', name:item.name || 'Food item', qty, amount });
      }
      if (!lines.length && Number(record.food_total)>0) lines.push({ source:'chillpill',name:'Food order (unitemized)',qty:1,amount:cents(record.food_total),menuRate:Number(record.food_total),customerRate:Number(record.food_total),menuRateSource:'customer',rateChange:0,menuValue:cents(record.food_total)/100 });
      const billed=Math.max(0,cents(record.amount));
      const bd=breakdown(record);
      const collected=bd.isWaived ? 0 : Math.max(0,Math.min(billed,record.paid ? billed : cents(bd.paidAmount)));
      const foodBudget=billed ? Math.round(collected * Math.min(billed,Math.max(0,cents(record.food_total))) / billed) : 0;
      const sourceKeys=[...new Set(lines.map(line=>line.source))];
      const weights=sourceKeys.map(source=>lines.filter(line=>line.source===source).reduce((sum,line)=>sum+line.amount,0));
      const amounts=allocate(foodBudget,weights);
      const result={ record,date,grossAmount:collected/100,foodTotal:foodBudget/100,timeRevenue:(collected-foodBudget)/100,
        chillpillFood:0,brosGross:0,brosCommission:0,brosPayable:0,bardaliGross:0,bardaliCommission:0,bardaliPayable:0,
        otherFoodGross:0,otherFoodCommission:0,otherFoodPayable:0,netFoodRevenue:0,netRevenue:0,partnerCost:0,pendingBills:0 };
      byRecord.set(record.id,result);
      sourceKeys.forEach((source,i)=>{
        const g=group(date,source), ordered=weights[i], collected=amounts[i];
        const sourceLines=lines.filter(line=>line.source===source);
        g.ordered+=ordered; g.collected+=collected;
        g.entries.push({record,result,ordered,collected,cost:0});
        const lineCollections=allocate(collected,sourceLines.map(line=>line.amount));
        sourceLines.forEach((line,index)=>g.lines.push({...line, collected:lineCollections[index], recordId:record.id, customer:record.customer_name || 'Walk-in'}));
      });
    }
    for (const bill of bills) group(bill.business_date,bill.supplier_key).bill=bill;
    for (const g of groups.values()) {
      g.paid=g.bill ? payments.filter(p=>p.bill_id===g.bill.id && !p.voided_at).reduce((sum,p)=>sum+cents(p.amount),0) : 0;
      g.pending=g.source!=='chillpill' && !g.bill;
      g.cost=g.source==='chillpill' ? 0 : g.bill ? cents(g.bill.amount) : g.collected;
      g.net=g.collected-g.cost;
      g.outstanding=g.bill ? Math.max(0,g.cost-g.paid) : 0;
      const costs=g.bill ? allocate(g.cost,g.entries.map(entry=>entry.ordered)) : g.entries.map(entry=>g.source==='chillpill' ? 0 : entry.collected);
      g.entries.forEach((entry,i)=>{
        entry.cost=costs[i]; const r=entry.result, net=(entry.collected-entry.cost)/100;
        if (g.source==='chillpill') r.chillpillFood+=entry.collected/100;
        else {
          const prefix=g.source==='bros_burger' ? 'bros' : g.source==='bardali' ? 'bardali' : 'otherFood';
          r[prefix+'Gross']+=entry.collected/100;
          r[prefix+'Commission']+=net; // Legacy property name; value is actual bill margin.
          r[prefix+'Payable']+=entry.cost/100;
          r.partnerCost+=entry.cost/100;
          if(g.pending)r.pendingBills++;
        }
        r.netFoodRevenue+=net;
      });
      g.changed=!!g.bill && cents(g.bill.order_gross_snapshot)!==g.ordered;
    }
    for (const r of byRecord.values()) r.netRevenue=r.timeRevenue+r.netFoodRevenue;
    const days=[...groups.values()].map(g=>({...g,ordered:g.ordered/100,collected:g.collected/100,cost:g.cost/100,net:g.net/100,paid:g.paid/100,outstanding:g.outstanding/100,
      lines:g.lines.map(line=>({...line,amount:line.amount/100,collected:line.collected/100})),orphanCost:g.bill && !g.entries.some(e=>e.ordered>0) ? g.cost/100 : 0 }));
    return { days, byRecord };
  }
  const api={calculate,allocate,day}; root.FoodPartnerMath=api;
  if(typeof module==='object' && module.exports)module.exports=api;
})(typeof window==='object' ? window : globalThis);
