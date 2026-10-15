import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paymentCart } from '../src/lib/payment-cart.ts';
import { verifyTelegram } from '../src/lib/telegram.ts';
import { alfaClient, ALFA_TEST_URLS } from '../src/lib/alfa.ts';

const lines=[{id:'t',title:'Вход',kind:'ticket',priceKopecks:10001,qty:3,cancelledQty:1,redeemed:0},{id:'b',title:'Бар',kind:'bar',priceKopecks:33333,qty:2,cancelledQty:0,redeemed:0}];
assert.equal(paymentCart(lines).amountKopecks,86668);
for (const invalid of [[],[{...lines[0],priceKopecks:0}],[{...lines[0],priceKopecks:1.1}],[{...lines[0],redeemed:1}],[{...lines[0],priceKopecks:2147483647}]]) assert.throws(()=>paymentCart(invalid));
console.log('OK: сумма в копейках, отменённые единицы исключены, пустые/дробные/слишком большие суммы закрыты');

const token='123:test-token', now=Date.now();
function signed(extra={}) {
 const values=new URLSearchParams({auth_date:String(Math.floor(now/1000)),query_id:'test',user:JSON.stringify({id:123456,first_name:'Гость'}),...extra});
 const data=[...values.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const key=createHmac('sha256','WebAppData').update(token).digest();values.set('hash',createHmac('sha256',key).update(data).digest('hex'));return values.toString();
}
assert.equal(verifyTelegram(signed(),token,now).id,123456);
for(const data of [signed().replace('Гость','Админ'),signed({auth_date:String(Math.floor(now/1000)-601)}),signed({auth_date:String(Math.floor(now/1000)+60)}),signed({user:'{}'}),signed()+'&user=evil']) {
 if(data===signed()) continue;
 assert.throws(()=>verifyTelegram(data,token,now));
}
assert.throws(()=>verifyTelegram(signed(),token+'wrong',now));
const changed=new URLSearchParams(signed());changed.set('user',JSON.stringify({id:1,first_name:'Админ'}));assert.throws(()=>verifyTelegram(changed.toString(),token,now));
console.log('OK: Telegram проверяет подпись, срок, повторяющиеся поля и подмену пользователя');

const requests=[];let reply={orderId:'bank-id',formUrl:'https://alfa.rbsuat.com/payment/test.html'};
const transport=async(url,options)=>{requests.push({url,body:new URLSearchParams(options.body)});return new Response(JSON.stringify(reply));};
const config={baseUrl:ALFA_TEST_URLS[0],userName:'test-user',password:'test-secret',returnBaseUrl:'https://app.example.com'};
const bank=alfaClient(config,transport);
await bank.register({id:'order-id',number:'ORD-TEST',amountKopecks:86668,email:'receipt@example.com',expiresAt:new Date(now+600000)});
assert.equal(requests[0].body.get('amount'),'86668');assert.equal(requests[0].body.get('currency'),'643');assert.equal(requests[0].body.get('orderNumber'),'order-id');
assert.equal(JSON.parse(requests[0].body.get('jsonParams')).email,'receipt@example.com');
reply={orderNumber:'order-id',amount:86668,currency:643,orderStatus:2};assert.equal((await bank.status('bank-id',{id:'order-id',amountKopecks:86668})).paid,true);
reply={...reply,orderStatus:1};assert.equal((await bank.status('bank-id',{id:'order-id',amountKopecks:86668})).paid,false);
for(const delta of [{amount:1},{currency:840},{orderNumber:'other'}]){reply={orderNumber:'order-id',amount:86668,currency:643,orderStatus:2,...delta};await assert.rejects(bank.status('bank-id',{id:'order-id',amountKopecks:86668}));}
reply={orderId:'bank-id',formUrl:'https://evil.example.com/pay'};await assert.rejects(bank.register({id:'order-id',number:'ORD-TEST',amountKopecks:86668,email:'r@example.com',expiresAt:new Date(now+60000)}));
assert.throws(()=>alfaClient({...config,baseUrl:'https://pay.alfabank.ru/payment/rest/'}));
console.log('OK: банк получает серверную сумму; hold не считается оплатой; чужие суммы, валюты, заказы и URL отклоняются; боевой шлюз выключен');
