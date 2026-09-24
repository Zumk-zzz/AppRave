import type { FastifyReply, FastifyRequest } from 'fastify';

import { db } from '../db.js';
import { forbidden, unauthorized } from '../lib/http-error.js';
import { canNow, effectiveRole, type Permission, type StaffRole, type UserRole } from '../lib/permissions.js';
import { verifyToken } from './jwt.js';

/** Кто выполняет запрос — уже разобранный и сверенный с базой. */
export interface Auth {
  sub: string;
  /** Должность. undefined у обычного гостя. */
  staffRole?: StaffRole;
  /** Роль для показа и для журнала: должность либо «гость» */
  role: UserRole;
  /** Открытая смена, если есть. От неё зависит часть прав. */
  shiftId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: Auth;
  }
}

/**
 * Разбирает токен и определяет, кем человек действует прямо сейчас.
 *
 * Роль берётся из базы, а не из токена. Две причины, и обе серьёзные:
 *
 *  1. Должность меняется. Токен живёт неделями, и уволенный сотрудник
 *     продолжал бы пропускать людей до истечения своего токена.
 *  2. Действующая роль зависит не только от должности, но и от того,
 *     на смене человек или нет. Бармен в выходной приходит отдыхать
 *     и покупает наравне со всеми — иначе ему пришлось бы заводить
 *     второй аккаунт, и продажа шла бы мимо его карты лояльности.
 *
 * Смена — единственный признак «я сейчас работаю». Отдельного флага
 * в приложении быть не должно: клиент объявил бы себя кем угодно,
 * а здесь состояние общее и его видно всей команде.
 */
export async function resolveAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return;

  const { sub } = verifyToken(header.slice(7));

  const user = await db.user.findUnique({
    where: { id: sub },
    select: {
      id: true,
      role: true,
      shifts: { where: { closedAt: null }, select: { id: true }, take: 1 },
    },
  });

  // Аккаунта нет — токен от удалённого пользователя
  if (!user) throw unauthorized('Недействительный токен');

  const staffRole = user.role === 'guest' ? undefined : (user.role as StaffRole);
  const shift = user.shifts[0];

  req.auth = {
    sub: user.id,
    staffRole,
    role: effectiveRole(staffRole),
    shiftId: shift?.id,
  };
}

/** Кто выполняет запрос. undefined, если заголовка не было. */
export function readAuth(req: FastifyRequest): Auth | undefined {
  return req.auth;
}

/** Требует авторизованного пользователя. */
export function requireUser(req: FastifyRequest): Auth {
  const auth = readAuth(req);
  if (!auth) throw unauthorized();
  return auth;
}

/**
 * Требует должность — независимо от того, открыта ли смена.
 *
 * Нужен ровно там, где смены ещё нет: чтобы её открыть. В остальных
 * местах проверяется право, а не должность.
 */
export function requireStaff(req: FastifyRequest): Auth & { staffRole: StaffRole } {
  const auth = requireUser(req);
  if (!auth.staffRole) throw forbidden('Действие доступно только сотрудникам');

  return auth as Auth & { staffRole: StaffRole };
}

/**
 * Требует конкретное право.
 *
 * Проверяется право, а не роль: набор прав у роли меняется в одном месте,
 * и ни один маршрут при этом трогать не нужно.
 */
export function requirePermission(req: FastifyRequest, permission: Permission): Auth {
  const auth = requireUser(req);

  if (!canNow(auth.staffRole, !!auth.shiftId, permission)) {
    // Сотруднику без смены объясняем, чего не хватает: «недостаточно прав»
    // у человека с нужной должностью выглядит поломкой, и он будет искать
    // ошибку в приложении, а не открывать смену
    if (auth.staffRole && canNow(auth.staffRole, true, permission)) {
      throw forbidden('Откройте смену: пропускать и выдавать можно только на смене');
    }

    throw forbidden(`Недостаточно прав: требуется ${permission}`);
  }

  return auth;
}

/**
 * Покупать может только гость.
 *
 * Персонал управляет клубом, а не покупает в нём: заказы сотрудников
 * исказили бы выручку и позволили бы выписать себе билет мимо кассы.
 * Но сотрудник не на смене — обычный гость, и покупает как все.
 */
export function requireCustomer(req: FastifyRequest): Auth {
  const auth = requireUser(req);

  if (!canNow(auth.staffRole, !!auth.shiftId, 'purchase')) {
    throw forbidden('Пока смена открыта, покупать нельзя — закройте её, чтобы отдыхать');
  }

  return auth;
}

export function roleOf(req: FastifyRequest): UserRole | undefined {
  return readAuth(req)?.role;
}
