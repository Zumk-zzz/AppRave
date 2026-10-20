import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireCustomer, requirePermission } from '../auth/guard.js';
import { db } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/http-error.js';
import { isLive } from '../lib/events.js';
import { applicablePromo, normalizePromo, promoDiscount, type PricedLine } from '../lib/promos.js';
import { pointsForPurchase } from '../lib/money.js';

const input=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/),title:z.string().trim().min(1).max(100),kind:z.enum(['percent','fixed']),value:z.number().int().positive().max(2147483647),scope:z.enum(['tickets','bar','tickets_bar']),active:z.boolean(),eventId:z.string().min(1).nullable().default(null),minSubtotalKopecks:z.number().int().nonnegative().max(2147483647).default(0),maxUses:z.number().int().positive().max(1000000).nullable().default(null),perUserLimit:z.number().int().positive().max(1000).default(1),startsAt:z.string().datetime().nullable().default(null),endsAt:z.string().datetime().nullable().default(null)}).superRefine((v,ctx)=>{if(v.kind==='percent'&&v.value>90)ctx.addIssue({code:'custom',message:'Скидка не выше 90%',path:['value']});if(v.startsAt&&v.endsAt&&Date.parse(v.endsAt)<=Date.parse(v.startsAt))ctx.addIssue({code:'custom',message:'Конец должен быть позже начала',path:['endsAt']});});
export async function promoRoutes(app:FastifyInstance){
  app.get('/admin/promos',async(req)=>{
    requirePermission(req,'promos:manage');
    const promos=await db.promo.findMany({orderBy:{createdAt:'desc'}}), now=new Date();
    return Promise.all(promos.map(async(p)=>({...p,used:await db.promoUse.count({where:{promoId:p.id,state:'used'}}),reserved:await db.promoUse.count({where:{promoId:p.id,state:'reserved',order:{status:'pending',expiresAt:{gt:now}}}})})));
  });
  app.post('/admin/promos',async(req,reply)=>{
    const auth=requirePermission(req,'promos:manage'),body=input.parse(req.body);
    if(body.eventId&&!await db.event.count({where:{id:body.eventId}}))throw notFound('Вечеринка не найдена');
    try {
      const promo=await db.$transaction(async tx=>{const p=await tx.promo.create({data:{...body,startsAt:body.startsAt?new Date(body.startsAt):null,endsAt:body.endsAt?new Date(body.endsAt):null}});await tx.staffAction.create({data:{actorId:auth.sub,shiftId:auth.shiftId,kind:'promo_created',details:{code:p.code,promoId:p.id,rule:body}}});return p;});
      return reply.code(201).send(promo);
    }catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw conflict('Такой промокод уже существует','promo_exists');throw e;}
  });
  app.put('/admin/promos/:id',async(req)=>{
    const auth=requirePermission(req,'promos:manage'),{id}=z.object({id:z.string()}).parse(req.params),body=input.parse(req.body);
    if(body.eventId&&!await db.event.count({where:{id:body.eventId}}))throw notFound('Вечеринка не найдена');
    return db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM promos WHERE id=${id} FOR UPDATE`;const old=await tx.promo.findUnique({where:{id}});if(!old)throw notFound('Промокод не найден');if(old.code!==body.code)throw badRequest('Код менять нельзя — создайте новый','immutable_code');const p=await tx.promo.update({where:{id},data:{...body,startsAt:body.startsAt?new Date(body.startsAt):null,endsAt:body.endsAt?new Date(body.endsAt):null}});await tx.staffAction.create({data:{actorId:auth.sub,shiftId:auth.shiftId,kind:'promo_updated',details:{code:p.code,promoId:p.id,before:{active:old.active,kind:old.kind,value:old.value,scope:old.scope,maxUses:old.maxUses,perUserLimit:old.perUserLimit},after:body}}});return p;});
  });
  app.post('/orders/promo-preview',async(req)=>{
    const auth=requireCustomer(req);
    const body=z.object({eventId:z.string(),promoCode:z.string().trim().min(3).max(32),tickets:z.array(z.object({ticketTypeId:z.string(),qty:z.number().int().min(1).max(10)})).max(50).default([]),bar:z.array(z.object({barItemId:z.string(),qty:z.number().int().min(1).max(50)})).max(50).default([]),table:z.object({tableId:z.string()}).optional()}).parse(req.body);
    return db.$transaction(async tx=>{
      const event=await tx.event.findUnique({where:{id:body.eventId}});if(!event||event.status!=='published'||!isLive(event.startsAt))throw notFound('Вечеринка недоступна');
      const lines:PricedLine[]=[];
      for(const i of body.tickets){const t=await tx.ticketType.findUnique({where:{id:i.ticketTypeId}});if(!t||t.eventId!==body.eventId)throw notFound('Билет не найден');lines.push({kind:'ticket',priceKopecks:t.priceKopecks,qty:i.qty});}
      for(const i of body.bar){const b=await tx.barItem.findUnique({where:{id:i.barItemId}});if(!b?.available)throw notFound('Напиток не найден');lines.push({kind:'bar',priceKopecks:b.priceKopecks,qty:i.qty});}
      if(body.table){const t=await tx.clubTable.findUnique({where:{id:body.table.tableId}});if(!t||t.blocked)throw notFound('Столик недоступен');lines.push({kind:'table',priceKopecks:t.depositKopecks,qty:1});}
      const subtotalKopecks=lines.reduce((sum,l)=>sum+l.priceKopecks*l.qty,0);if(subtotalKopecks>2147483647)throw badRequest('Слишком большая сумма');
      const promo=await applicablePromo(tx,normalizePromo(body.promoCode),auth.sub,body.eventId);
      const {discountKopecks}=promoDiscount(promo,lines),amountKopecks=subtotalKopecks-discountKopecks;
      return {code:promo.code,subtotalKopecks,discountKopecks,amountKopecks,points:pointsForPurchase(amountKopecks),scope:promo.scope};
    });
  });
}
