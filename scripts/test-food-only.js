const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/js/dashboard.js','utf8');
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,required:true,dataset:{},handlers:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll(){return[]},addEventListener(type,handler){this.handlers[type]=handler;},parentElement:{classList:{toggle(){}}}});return nodes.get(id);};
let saved=[],food=[{id:'food',name:'Coke',qty:1,price:100}],messages=[];
const ctx=vm.createContext({document:{getElementById:node},window:{sb:{from:table=>({insert:async record=>{saved.push(record);return {error:null}}})}},sdkReady:true,currentStaff:{id:'staff',name:'Staff'},pendingWaitingId:null,stations:[],Date,
 frTotal:()=>100,calcExtraStationsCost:()=>300,inr:String,showMessage:message=>messages.push(message),showToast(){},collectFrItems:()=>food,collectExtraStations:()=>[{station:'Station 2'}],syncBrosInternalDiscountRows(){},updateStationConflictUI:()=>({blocked:false}),combineDateAndTime:()=>new Date(),updateNsInternalSaleState(){},timeInputValue:()=> '12:00',syncEndFromDuration(){},clearFrContainer(){},addFrRow(){},clearExtraStations(){},fetchSessions(){}});
vm.runInContext(source.slice(source.indexOf('  function updateNsFoodOnlyState('),source.indexOf('  // ---- Extra Stations helpers')),ctx);
node('admin-rate').value='300';node('duration-minutes').value='60';node('rate').value='300';node('ns-extra-controllers').value='2';node('session-status').value='Booked';node('ns-is-food-only').checked=true;
ctx.updateNsFoodOnlyState();
assert.equal(node('customer-phone').required,false);assert.equal(node('session-status').disabled,true);
assert.equal(JSON.stringify(ctx.calculateAmount()),JSON.stringify({total:100,foodTotal:100,timeCost:0,duration:0,rate:0,extraCost:0,ctrlCount:0,ctrlCost:0}));
node('ns-is-food-only').checked=false;ctx.updateNsFoodOnlyState();assert.equal(ctx.calculateAmount().total,800);node('ns-is-food-only').checked=true;ctx.updateNsFoodOnlyState();
const a=source.indexOf('    document.getElementById("session-form").addEventListener');const b=source.indexOf('    document.getElementById("waiting-add-food-row")',a);vm.runInContext(source.slice(a,b),ctx);
const event={preventDefault(){},target:{reset(){node('ns-is-food-only').checked=false;node('session-status').value='Active';}}};
(async()=>{food=[];await node('session-form').handlers.submit(event);assert.equal(saved.length,0);assert.ok(messages.pop().includes('at least one'));
food=[{id:'food',name:'Coke',qty:1,price:100}];await node('session-form').handlers.submit(event);const record=saved[0];
assert.equal(record.station_name,'Counter / Cafe');assert.equal(record.duration_minutes,0);assert.equal(record.rate,0);assert.equal(record.amount,100);assert.equal(record.status,'Active');assert.equal(record.extra_stations.length,0);assert.equal(record.food_items.length,1);assert.ok(record.notes.includes('[Food Only Sale]'));assert.equal(record.customer_phone,'—');assert.equal(record.start_time,record.end_time);
assert.equal(node('session-status').disabled,false);assert.equal(node('customer-phone').required,true);
assert.equal(ctx.calculateAmount().total,700); // Controllers reset after a saved order.
vm.runInContext(source.slice(source.indexOf('  function stationDate('),source.indexOf('  function getStationCompletion(')),ctx);assert.equal(ctx.getRecordStations(record).length,0);
console.log('Passed: food-only totals, optional customer details, empty-order rejection, real submit payload, form reset, gaming restoration and no occupied stations.');
})().catch(error=>{console.error(error);process.exitCode=1;});
