import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentActor } from './session';
import { mockCatalog } from './catalog.mock';
import { logMock } from './staff.mock';
import type { CheckoutItem, Promo, PromoRule } from './types';
const KEY='apprave.promos';
type Data={promos:Promo[];uses:{orderId:string;promoId:string;userId:string}[]};
async function read():Promise<Data>{const raw=await AsyncStorage.getItem(KEY);return raw?JSON.parse(raw):{promos:[],uses:[]};}
async function write(data:Data){await AsyncStorage.setItem(KEY,JSON.stringify(data));}
function admin(){const actor=currentActor();if(actor?.staffRole!=='admin')throw new Error('Промокоды доступны администратору');return actor;}
function validate(rule:PromoRule){if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(rule.code)||!rule.title.trim()||!Number.isInteger(rule.value)||rule.value<1||(rule.kind==='percent'&&rule.value>90)||rule.minSubtotalKopecks<0||rule.perUserLimit<1||(rule.maxUses!==null&&rule.maxUses<1)||(rule.startsAt&&rule.endsAt&&Date.parse(rule.endsAt)<=Date.parse(rule.startsAt)))throw new Error('Проверьте условия промокода');}
export const mockPromos={
 async list(){admin();const d=await read();return d.promos.map(p=>({...p,used:d.uses.filter(u=>u.promoId===p.id).length,reserved:0}));},
 async create(rule:PromoRule){const actor=admin();rule={...rule,code:rule.code.trim().toUpperCase()};validate(rule);const d=await read();if(d.promos.some(p=>p.code===rule.code))throw new Error('Код уже существует');d.promos.unshift({...rule,id:`promo-${Date.now()}-${Math.random().toString(36).slice(2)}`,createdAt:new Date().toISOString(),used:0,reserved:0});await write(d);await logMock({kind:'promo_created',user:actor,summary:rule.code});},
 async update(id:string,rule:PromoRule){const actor=admin();validate(rule);const d=await read(),old=d.promos.find(p=>p.id===id);if(!old||old.code!==rule.code)throw new Error('Промокод не найден или изменён код');d.promos=d.promos.map(p=>p.id===id?{...p,...rule}:p);await write(d);await logMock({kind:'promo_updated',user:actor,summary:rule.code});},
 async quote(items:CheckoutItem[],code:string){
  const actor=currentActor();if(!actor)throw new Error('Войдите в аккаунт');const events=new Set(items.map(i=>i.eventId));if(events.size!==1)throw new Error('Промокод применяется к корзине одной вечеринки');
  const d=await read(),p=d.promos.find(p=>p.code===code.trim().toUpperCase()),now=new Date().toISOString(),eventId=items[0]?.eventId;
  if(!p||!p.active||(p.startsAt&&Date.parse(p.startsAt)>Date.parse(now))||(p.endsAt&&Date.parse(p.endsAt)<=Date.parse(now))||(p.eventId&&p.eventId!==eventId))throw new Error('Промокод недоступен для этой покупки');
  const uses=d.uses.filter(u=>u.promoId===p.id);if((p.maxUses!==null&&uses.length>=p.maxUses)||uses.filter(u=>u.userId===actor.id).length>=p.perUserLimit)throw new Error('Лимит промокода исчерпан');
  const [tickets,bar,tables]=await Promise.all([mockCatalog.events(),mockCatalog.barMenu(),mockCatalog.tables()]);
  const event=tickets.find(e=>e.id===eventId);if(!event||event.status==='cancelled'||event.status==='draft'||new Date(event.date).getTime()+8*3600000<Date.now())throw new Error('Вечеринка недоступна');
  const amounts=items.map(i=>{const price=i.kind==='ticket'?event.tickets.find(t=>t.id===i.refId)?.price:i.kind==='bar'?bar.find(b=>b.id===i.refId&&b.available)?.price:tables.find(t=>t.id===i.refId&&!t.blocked)?.deposit;if(price===undefined)throw new Error('Позиция недоступна');if(Math.round(price*100)!==Math.round(i.price*100))throw new Error('Цены изменились — обновите корзину');return Math.round(price*100)*i.qty;});
  const eligible=items.map((i,n)=>i.kind==='ticket'&&p.scope!=='bar'||i.kind==='bar'&&p.scope!=='tickets'?amounts[n]:0),base=eligible.reduce((a,b)=>a+b,0);
  if(base<p.minSubtotalKopecks||base<2)throw new Error('Корзина не подходит под условия промокода');const discountKopecks=Math.min(base-1,p.kind==='percent'?Math.floor(base*p.value/100):p.value);if(discountKopecks<1)throw new Error('Промокод не даёт скидку');
  const allocations=eligible.map(n=>Number(BigInt(discountKopecks)*BigInt(n)/BigInt(base)));let rest=discountKopecks-allocations.reduce((a,b)=>a+b,0);for(let n=0;rest>0;n=(n+1)%eligible.length)if(eligible[n]>allocations[n]){allocations[n]++;rest--;}
  const subtotalKopecks=amounts.reduce((a,b)=>a+b,0),amountKopecks=subtotalKopecks-discountKopecks;
  return {id:p.id,code:p.code,scope:p.scope,subtotalKopecks,discountKopecks,amountKopecks,points:Math.floor(amountKopecks/2000),allocations};
 },
 async consume(promoId:string,orderId:string){const d=await read();if(!d.uses.some(u=>u.orderId===orderId)){d.uses.push({promoId,orderId,userId:currentActor()!.id});await write(d);}},
};
