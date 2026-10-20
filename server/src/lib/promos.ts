import type { Prisma } from '@prisma/client';
import { conflict } from './http-error.js';

export function normalizePromo(code: string) { return code.trim().toUpperCase(); }
export type PromoRule = { kind: string; value: number; scope: string; minSubtotalKopecks: number };
export type PricedLine = { kind: string; priceKopecks: number; qty: number };
/** Депозит не получает скидку; распределение по строкам сохраняет точную сумму. */
export function promoDiscount(rule: PromoRule, lines: PricedLine[]) {
  const eligible = lines.map(l => (l.kind==='ticket' && rule.scope!=='bar') || (l.kind==='bar' && rule.scope!=='tickets') ? l.priceKopecks*l.qty : 0);
  const base = eligible.reduce((a,b)=>a+b,0);
  if (base<rule.minSubtotalKopecks || base<2) throw conflict('Корзина не подходит под условия промокода', 'promo_minimum');
  const discount = Math.min(base-1, rule.kind==='percent' ? Math.floor(base*rule.value/100) : rule.value);
  if (discount<1) throw conflict('Промокод не даёт скидку для этой корзины', 'promo_not_applicable');
  const allocations=eligible.map(amount=>Number(BigInt(discount)*BigInt(amount)/BigInt(base)));
  let rest=discount-allocations.reduce((a,b)=>a+b,0);
  for(let i=0;rest>0;i=(i+1)%allocations.length) if(eligible[i]>allocations[i]){allocations[i]++;rest--;}
  return {discountKopecks:discount, allocations};
}

export async function applicablePromo(tx: Prisma.TransactionClient, code: string, userId: string, eventId: string, lock=false) {
  const normalized=normalizePromo(code);
  if(lock) await tx.$queryRaw`SELECT id FROM promos WHERE code=${normalized} FOR UPDATE`;
  const promo=await tx.promo.findUnique({where:{code:normalized}}), now=new Date();
  if(!promo || !promo.active || (promo.startsAt && promo.startsAt>now) || (promo.endsAt && promo.endsAt<=now) || (promo.eventId && promo.eventId!==eventId)) throw conflict('Промокод недоступен для этой покупки', 'promo_unavailable');
  const liveUse: Prisma.PromoUseWhereInput={promoId:promo.id,OR:[{state:'used'},{state:'reserved',order:{status:'pending',expiresAt:{gt:now}}}]};
  const [total,own]=await Promise.all([tx.promoUse.count({where:liveUse}),tx.promoUse.count({where:{...liveUse,userId}})]);
  if((promo.maxUses!==null && total>=promo.maxUses) || own>=promo.perUserLimit) throw conflict('Лимит применений промокода исчерпан', 'promo_limit');
  return promo;
}
