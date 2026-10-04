/** Только отдельная тестовая база: сценарий создаёт заказы и отменяет свою вечеринку. */
import assert from 'node:assert/strict';
const BASE=process.env.API_URL??'http://127.0.0.1:3000';
async function api(path,token,body,method=body===undefined?'GET':'POST'){
 const res=await fetch(BASE+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{ }),'idempotency-key':crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:res.status,body:await res.json()};
}
async function ok(path,token,body,method,expected=200){const r=await api(path,token,body,method);assert.equal(r.status,expected,`${path}: ${JSON.stringify(r.body)}`);return r.body;}
async function login(contact=`ops-${crypto.randomUUID()}@example.com`){await ok('/auth/request-code',null,{contact});return ok('/auth/verify',null,{contact,code:'0000'});}
const admin=await login('+79000000000'),owner=await login(),friend=await login();
const workers=[];
async function worker(role){const contact=`ops-${crypto.randomUUID()}@example.com`;await ok('/staff/members',admin.token,{contact,role,name:`Операции ${role} ${workers.length}`});const u=await login(contact);u.shift=await ok('/staff/shift/open',u.token,{});workers.push(u);return u;}
try{
 await api('/staff/shift/close',admin.token,{});const adminShift=await ok('/staff/shift/open',admin.token,{});
 const door=await worker('doorman'),b1=await worker('bartender'),b2=await worker('bartender'),b3=await worker('bartender');
 const evBody={title:`OPERATIONS ${crypto.randomUUID()}`,subtitle:'',date:new Date(Date.now()+96*3600000).toISOString(),genre:'techno',ageLimit:18,lineup:[],description:'',cover:['#FF2E93','#7A1350'],status:'published',tickets:[{name:'Вход',description:'',priceKopecks:10000,quantity:30}]};
 const ev=await ok('/admin/events',admin.token,evBody,'POST',201),full=await ok(`/events/${ev.id}`);evBody.tickets[0].id=full.tickets[0].id;
 const drink=(await ok('/bar/menu')).find(b=>b.available);
 await ok('/stock/moves',admin.token,{barItemId:drink.id,kind:'receipt',delta:40,comment:'Operations smoke'},'POST',201);
 const stockBefore=(await ok('/stock',admin.token)).find(s=>s.barItemId===drink.id).qty;
 const reservedBefore=(await ok(`/staff/shifts/${b1.shift.id}/report`,b1.token)).stock.find(r=>r.barItemId===drink.id).reserved;
 const tb=await ok('/admin/tables',admin.token,{label:`OPS-${crypto.randomUUID().slice(0,8)}`,zone:'vip',seats:2,includedEntries:2,depositKopecks:drink.priceKopecks*4,x:0.1,y:0.1,w:0.1,h:0.1},'POST',201);
 async function purchase(body){const o=await ok('/orders',owner.token,{eventId:ev.id,...body},'POST',201);const p=await ok('/payments',owner.token,{orderId:o.id});await ok('/webhooks/payment',owner.token,{providerId:p.providerId,status:'succeeded'});return ok(`/orders/${o.id}`,owner.token);}
 const source=await purchase({table:{tableId:tb.id,guests:['Владелец','Друг']}});
 const booking=await ok(`/orders/${source.id}/table`,owner.token);
 assert.equal(booking.depositRemainingKopecks,drink.priceKopecks*4);
 assert.equal((await api(`/orders/${source.id}/table`,friend.token)).status,404);
 assert.equal((await api(`/staff/tables?eventId=${ev.id}`,b1.token)).status,403);
 const statePath=`/staff/tables/${booking.id}/state`;
 assert.equal((await api(statePath,admin.token,{state:'occupied',expectedState:'reserved'})).body.code,'invalid_table_transition');
 const invite=await ok(`/orders/${source.id}/invitations`,owner.token,{name:'Друг',requestId:crypto.randomUUID()});
 await ok(`/invitations/${invite.token}/claim`,friend.token,{});
 assert.equal((await api(`/orders/${source.id}/deposit/order`,owner.token,{barItemId:drink.id,qty:2,requestId:crypto.randomUUID()})).body.code,'entry_required');
 await ok(`/staff/scan/${source.number}/admit`,door.token,{qty:1,ownerPresent:true});
 assert.equal((await ok(`/orders/${source.id}/table`,owner.token)).serviceStatus,'arrived');
 await ok(statePath,admin.token,{state:'occupied',expectedState:'arrived',responsibleId:b1.user.id});
 const floor=(await ok(`/staff/tables?eventId=${ev.id}`,admin.token)).find(t=>t.id===booking.id);assert.equal(floor.responsibleId,b1.user.id);
 console.log('OK: столик проходит этапы, вход отмечает прибытие, ответственный и права проверяются');

 const pointsBefore=(await ok('/auth/me',owner.token)).points;
 const depositPath=`/orders/${source.id}/deposit/order`,key=crypto.randomUUID();
 const duplicate=await Promise.all([1,2].map(()=>ok(depositPath,owner.token,{barItemId:drink.id,qty:2,requestId:key},'POST',201)));
 assert.equal(duplicate[0].id,duplicate[1].id);const first=duplicate[0];
 assert.ok((await ok(`/staff/orders?eventId=${ev.id}&queueOnly=true`,b1.token)).some(o=>o.id===first.id));
 assert.equal(first.totalKopecks,0);assert.equal(first.depositUsedKopecks,drink.priceKopecks*2);
 const remainingRaces=await Promise.all([1,2].map(()=>api(depositPath,owner.token,{barItemId:drink.id,qty:2,requestId:crypto.randomUUID()})));
 assert.deepEqual(remainingRaces.map(r=>r.status).sort(),[201,409]);const second=remainingRaces.find(r=>r.status===201).body;
 assert.equal((await ok(`/orders/${source.id}/table`,owner.token)).depositRemainingKopecks,0);
 assert.equal((await ok('/stock',admin.token)).find(s=>s.barItemId===drink.id).qty,stockBefore-4);
 assert.equal((await ok('/auth/me',owner.token)).points,pointsBefore);
 assert.equal((await api(`/orders/${source.id}/cancel`,owner.token,{})).body.code,'deposit_used');
 const sourceLine=source.lines.find(l=>l.kind==='table');
 assert.equal((await api(`/orders/${source.id}/lines/${sourceLine.id}/cancel`,owner.token,{qty:1})).body.code,'deposit_used');
 assert.equal((await api('/payments',owner.token,{orderId:first.id})).status,409);
 console.log('OK: депозит и склад списываются один раз, гонка не уводит баланс в минус, нет повторной оплаты и баллов');

 const line=first.lines[0],bp=`/staff/bar/${line.id}`,issue=`/staff/scan/${first.number}/issue`;
 await ok(`${bp}/prepare`,b1.token,{});await ok(`${bp}/ready`,b1.token,{qty:1,expectedPreparing:2});
 assert.equal((await api('/staff/shift/close',b1.token,{})).body.code,'pending_preparations');
 assert.equal((await api(`${bp}/transfer`,b2.token,{toUserId:b3.user.id,expectedAssignee:b1.user.id,reason:'Не моя позиция'})).status,403);
 assert.equal((await api(`${bp}/transfer`,b1.token,{toUserId:door.user.id,expectedAssignee:b1.user.id,reason:'Не работает в баре'})).status,409);
 await ok(`${bp}/transfer`,b1.token,{toUserId:b2.user.id,expectedAssignee:b1.user.id,reason:'Заканчиваю смену'});
 assert.equal((await api(`${bp}/transfer`,b1.token,{toUserId:b3.user.id,expectedAssignee:b1.user.id,reason:'Повтор передачи'})).body.code,'stale_transfer');
 const transferred=(await ok(`/orders/${first.id}`,owner.token)).lines[0];assert.equal(transferred.preparingQty,1);assert.equal(transferred.readyQty,1);assert.equal(transferred.preparedById,b2.user.id);
 assert.equal((await api(`${bp}/ready`,b1.token,{qty:1,expectedPreparing:1})).status,403);
 const reportPath=`/staff/shifts/${b1.shift.id}/report`;
 const preview=await ok(reportPath,b1.token),held=preview.stock.find(r=>r.barItemId===drink.id);
 assert.equal(held.available,stockBefore-4);assert.equal(held.reserved,reservedBefore+4);assert.equal(held.expected,stockBefore+reservedBefore);
 await ok(issue,b2.token,{lineId:line.id,qty:1,expectedRedeemed:0});
 assert.equal((await api('/staff/shift/close',b1.token,{counts:[{barItemId:drink.id,actual:held.expected,available:held.available,reserved:held.reserved,reason:''}]})).body.code,'stale_inventory');
 const fresh=await ok(reportPath,b1.token),row=fresh.stock.find(r=>r.barItemId===drink.id);
 assert.equal(row.reserved,reservedBefore+3);assert.equal(row.expected,stockBefore+reservedBefore-1);
 const count={barItemId:drink.id,actual:row.expected-1,available:row.available,reserved:row.reserved,reason:''};
 assert.equal((await api('/staff/shift/close',b1.token,{counts:[count]})).body.code,'variance_reason_required');
 const inventoryBeforeClose=(await ok('/stock',admin.token)).find(s=>s.barItemId===drink.id).qty;
 const closed=await ok('/staff/shift/close',b1.token,{note:'Передал работу',counts:[{...count,reason:'Недостаёт одна готовая порция'}]});
 assert.ok(closed.closedAt);const saved=await ok(reportPath,b1.token);assert.equal(saved.saved,true);assert.equal(saved.started,2);assert.equal(saved.ready,1);assert.equal(saved.issued,0);assert.equal(saved.stock.find(r=>r.barItemId===drink.id).difference,-1);
 assert.equal((await ok('/stock',admin.token)).find(s=>s.barItemId===drink.id).qty,inventoryBeforeClose);
 assert.equal((await api(reportPath,b2.token)).status,404);assert.equal((await api(reportPath,owner.token)).status,403);await ok(reportPath,admin.token);
 console.log('OK: передача сохраняет готовое; закрытие блокирует незавершённое и устаревшую сверку, требует причину, сохраняет отчёт');

 await ok(`${bp}/ready`,b2.token,{qty:1,expectedPreparing:1});await ok(issue,b2.token,{lineId:line.id,qty:1,expectedRedeemed:1});
 const secondLine=second.lines[0];await ok(`/staff/bar/${secondLine.id}/prepare`,b2.token,{});await ok(`/staff/bar/${secondLine.id}/ready`,b2.token,{qty:2,expectedPreparing:2});await ok(`/staff/scan/${second.number}/issue`,b2.token,{lineId:secondLine.id,qty:2,expectedRedeemed:0});
 assert.deepEqual(await ok(reportPath,b1.token),saved);
 assert.equal((await ok(`/staff/orders?eventId=${ev.id}&queueOnly=true`,b2.token)).length,0);
 await ok(`/staff/invitations/${invite.token}/admit`,door.token,{});
 await ok(statePath,admin.token,{state:'released',expectedState:'occupied',confirmRemainingKopecks:0});
 assert.equal((await api(depositPath,owner.token,{barItemId:drink.id,qty:1,requestId:crypto.randomUUID()})).body.code,'deposit_inactive');
 const cancelled=await purchase({tickets:[{ticketTypeId:full.tickets[0].id,qty:1}]});await ok(`/orders/${cancelled.id}/cancel`,owner.token,{});
 const trace=await ok(`/staff/orders/${source.number}/timeline`,admin.token);
 for(const kind of ['created','paid','invitation','invitation_claimed','entry_admitted','deposit_spent','table_updated'])assert.ok(trace.rows.some(r=>r.kind===kind),kind);
 assert.ok((await ok(`/staff/orders/${first.number}/timeline`,admin.token)).rows.some(r=>r.kind==='bar_transferred'));
 assert.ok((await ok(`/staff/orders/${cancelled.number}/timeline`,admin.token)).rows.some(r=>r.kind==='cancelled'));
 assert.equal((await api(`/staff/orders/${source.number}/timeline`,b2.token)).status,403);
 const summary=await ok(`/staff/shifts/${adminShift.id}/report`,admin.token);assert.equal(summary.salesKopecks,source.totalKopecks);
 await ok(`/admin/events/${ev.id}`,admin.token,{...evBody,status:'cancelled'},'PUT');
 const refund=await ok(`/admin/events/${ev.id}/refund`,admin.token,{confirm:evBody.title});assert.equal(refund.totalKopecks,source.totalKopecks);
 assert.equal((await ok('/stock',admin.token)).find(s=>s.barItemId===drink.id).qty,stockBefore-4);
 console.log('OK: отчёт неизменяемый, история полная и закрыта по ролям; депозит не дублирует выручку или возврат');
}finally{for(const w of workers)await api('/staff/shift/close',w.token,{});await api('/staff/shift/close',admin.token,{});}
