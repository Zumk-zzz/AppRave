/** Только одноразовая БД на 5546; банк заменён проверяемым транспортом, денег нет. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
if (!process.env.DATABASE_URL?.includes(':5546/')) throw new Error('Нужна отдельная тестовая БД на порту 5546');
process.env.PAYMENT_PROVIDER='alfa_test'; process.env.TELEGRAM_BOT_TOKEN='123:test-bot-token';
const [{default:Fastify},{ZodError},{db},{resolveAuth},{authRoutes},{orderRoutes},{catalogRoutes},{adminRoutes},{refundRoutes},{createPaymentRoutes},{alfaClient},{HttpError}]=await Promise.all([
 import('fastify'),import('zod'),import('../src/db.ts'),import('../src/auth/guard.ts'),import('../src/routes/auth.ts'),import('../src/routes/orders.ts'),import('../src/routes/catalog.ts'),import('../src/routes/admin.ts'),import('../src/routes/refunds.ts'),import('../src/routes/payments.ts'),import('../src/lib/alfa.ts'),import('../src/lib/http-error.ts')]);
const app=Fastify();app.addHook('preHandler',resolveAuth);
app.setErrorHandler((e,_req,reply)=>reply.code(e instanceof HttpError?e.statusCode:e instanceof ZodError?400:500).send({error:e.message,code:e.code}));
const bankOrders=new Map();let registrations=0;
const fakeTransport=async(url,options)=>{
 const body=new URLSearchParams(options.body);let response;
 if(url.endsWith('register.do')){registrations++;const providerId=crypto.randomUUID();bankOrders.set(providerId,{orderNumber:body.get('orderNumber'),amount:Number(body.get('amount')),currency:643,orderStatus:0,email:JSON.parse(body.get('jsonParams')).email});response={orderId:providerId,formUrl:`https://alfa.rbsuat.com/payment/test.html?mdOrder=${providerId}`};}
 else response=bankOrders.get(body.get('orderId'))??{errorCode:6};
 return new Response(JSON.stringify(response));
};
const gateway=()=>alfaClient({baseUrl:'https://alfa.rbsuat.com/payment/rest/',userName:'test',password:'test',returnBaseUrl:'https://web.example.com'},fakeTransport);
await app.register(authRoutes);await app.register(catalogRoutes);await app.register(adminRoutes);await app.register(orderRoutes);await app.register(refundRoutes);await app.register(createPaymentRoutes(gateway));
async function api(path,token,body,method=body===undefined?'GET':'POST',key=crypto.randomUUID()){
 const r=await app.inject({method,url:path,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),'idempotency-key':key},...(body===undefined?{}:{payload:body})});return{status:r.statusCode,body:r.json()};
}
async function ok(...args){const r=await api(...args);assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;}
async function login(contact=`web-${crypto.randomUUID()}@example.com`){await ok('/auth/request-code',null,{contact});return ok('/auth/verify',null,{contact,code:'0000'});}
try {
 const admin=await login('+79000000000'),owner=await login(),other=await login();
 const ev=await ok('/admin/events',admin.token,{title:`WEB-PAY ${crypto.randomUUID()}`,subtitle:'',date:new Date(Date.now()+96*3600000).toISOString(),genre:'techno',ageLimit:18,lineup:[],description:'',cover:['#FF2E93','#7A1350'],status:'published',tickets:[{name:'Вход',description:'',priceKopecks:10001,quantity:100}]});
 const full=await ok(`/events/${ev.id}`),ticket=full.tickets[0];
 const body={eventId:ev.id,receiptEmail:'receipt@example.com',tickets:[{ticketTypeId:ticket.id,qty:3}],expectedTotalKopecks:30003};
 assert.equal((await api('/orders',owner.token,{...body,receiptEmail:undefined})).body.code,'receipt_email_required');
 assert.equal((await api('/orders',owner.token,{...body,expectedTotalKopecks:1})).body.code,'price_changed');
 assert.equal((await ok(`/events/${ev.id}`)).tickets[0].available,100);
 const key=crypto.randomUUID(),order=await ok('/orders',owner.token,body,'POST',key);
 assert.equal((await api('/orders',other.token,body,'POST',key)).body.code,'key_used');
 await ok(`/orders/${order.id}/lines/${order.lines[0].id}/cancel`,owner.token,{qty:1});
 const count=registrations;
 const sessions=await Promise.all([ok('/payments',owner.token,{orderId:order.id}),ok('/payments',owner.token,{orderId:order.id})]);
 assert.equal(registrations,count+1);assert.equal(sessions[0].providerId,sessions[1].providerId);
 const payment=sessions[0],external=bankOrders.get(payment.providerId);
 const {env}=await import('../src/env.ts');env.PAYMENT_PROVIDER='stub';
 assert.equal((await api('/payments',owner.token,{orderId:order.id})).body.code,'payment_provider_changed');
 assert.equal((await api('/webhooks/payment',owner.token,{providerId:payment.providerId,status:'succeeded'})).status,403);
 env.PAYMENT_PROVIDER='alfa_test';
 assert.equal((await ok(`/orders/${order.id}/payment`,owner.token)).providerId,payment.providerId);
 assert.equal((await api(`/orders/${order.id}/payment`,other.token)).status,404);
 assert.equal(payment.amountKopecks,20002);assert.equal(payment.cart.items[0].qty,2);assert.equal(external.email,'receipt@example.com');
 assert.equal(payment.fiscalReceipt.status,'not_configured');
 assert.equal((await api('/webhooks/payment',owner.token,{providerId:payment.providerId,status:'succeeded'})).status,403);
 assert.equal((await api(`/payments/${payment.providerId}`,other.token)).status,404);
 assert.equal((await api(`/orders/${order.id}/cancel`,owner.token,{})).body.code,'payment_in_progress');
 assert.equal((await api(`/orders/${order.id}/lines/${order.lines[0].id}/cancel`,owner.token,{qty:1})).body.code,'payment_in_progress');
 await ok(`/webhooks/alfa?mdOrder=${payment.providerId}&status=1&amount=1`);
 assert.equal((await ok(`/orders/${order.id}`,owner.token)).status,'pending');
 external.amount=1;assert.equal((await api(`/payments/${payment.providerId}`,owner.token)).body.code,'payment_mismatch');external.amount=20002;
 external.currency=840;assert.equal((await api(`/payments/${payment.providerId}`,owner.token)).body.code,'payment_mismatch');external.currency=643;
 external.orderStatus=1;assert.equal((await ok(`/payments/${payment.providerId}`,owner.token)).order.status,'pending');
 external.orderStatus=2;
 const results=await Promise.all([ok(`/payments/${payment.providerId}`,owner.token),ok(`/payments/${payment.providerId}`,owner.token)]);
 assert.ok(results.every(r=>r.order.status==='paid'));const me=await ok('/auth/me',owner.token);assert.equal(me.points,results[0].order.pointsEarned);
 external.orderStatus=6;await ok(`/payments/${payment.providerId}`,owner.token);assert.equal((await ok('/auth/me',owner.token)).points,me.points);
 console.log('OK: сумма, email и состав берутся на сервере; повтор не создаёт второй платёж; поддельное уведомление и hold не выдают заказ');

 const late=await ok('/orders',owner.token,body),latePayment=await ok('/payments',owner.token,{orderId:late.id});
 await db.order.update({where:{id:late.id},data:{expiresAt:new Date(Date.now()-1000)}});bankOrders.get(latePayment.providerId).orderStatus=2;
 const lateState=await ok(`/payments/${latePayment.providerId}`,owner.token);assert.equal(lateState.needsReview,true);assert.notEqual(lateState.order.status,'paid');assert.equal((await ok('/auth/me',owner.token)).points,me.points);
 await db.event.update({where:{id:ev.id},data:{status:'cancelled'}});
 assert.equal((await api(`/admin/events/${ev.id}/refund`,admin.token,{confirm:full.title})).body.code,'bank_refund_not_configured');
 console.log('OK: поздняя оплата требует сверки; двойных баллов нет; имитация банковского возврата запрещена');

 function signed(id,age=0){const values=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)-age),user:JSON.stringify({id,first_name:'Telegram гость'})});const data=[...values.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');const key=createHmac('sha256','WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();values.set('hash',createHmac('sha256',key).update(data).digest('hex'));return values.toString();}
 const telegramId=Date.now(),initData=signed(telegramId);
 assert.equal((await api('/auth/telegram',null,{initData:signed(telegramId,601)})).status,401);
 const linked=await ok('/auth/telegram/link',owner.token,{initData});assert.equal(linked.id,owner.user.id);
 const telegram=await ok('/auth/telegram',null,{initData});assert.equal(telegram.user.id,owner.user.id);assert.equal(telegram.user.role,'guest');
 assert.equal((await api('/auth/telegram/link',other.token,{initData})).body.code,'telegram_already_linked');
 const newTelegram=await Promise.all([ok('/auth/telegram',null,{initData:signed(telegramId+1)}),ok('/auth/telegram',null,{initData:signed(telegramId+1)})]);assert.equal(newTelegram[0].user.id,newTelegram[1].user.id);assert.equal(newTelegram[0].user.role,'guest');
 assert.equal((await api('/auth/telegram',null,{initData:initData.replace('hash=','hash=00')})).status,401);
 console.log('OK: Telegram сохраняет существующий аккаунт при привязке, не объединяет чужие аккаунты, не выдаёт административную роль');
} finally {await app.close();await db.$disconnect();}
