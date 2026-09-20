/**
 * Роли и права доступа.
 *
 * Код проверяет ПРАВА, а не роли. Роль — это просто именованный набор прав,
 * и такое разделение окупается на первом же «а пусть старший бармен ещё
 * и списывать умеет»: меняется один пресет, а не пятнадцать экранов.
 *
 * Этот файл продублирован на сервере (server/src/lib/permissions.ts) и
 * должен совпадать с ним дословно. Клиент прячет кнопки, сервер запрещает
 * действия — проверка нужна с обеих сторон, потому что спрятанная кнопка
 * защищает только от случайного нажатия, но не от подделанного запроса.
 */

/** Должность сотрудника. Закреплена за человеком и меняется редко. */
export type StaffRole = 'bartender' | 'doorman' | 'manager' | 'admin';

/**
 * Роль, в которой человек действует прямо сейчас.
 *
 * Это не то же самое, что должность. Бармен в свой выходной приходит
 * отдыхать и должен покупать наравне со всеми — поэтому должность
 * хранится отдельно, а действующая роль зависит ещё и от того,
 * на смене человек или нет.
 */
export type UserRole = 'guest' | StaffRole;

export type Permission =
  /** Пропускать гостей по билетам */
  | 'scan:entry'
  /** Выдавать напитки по предзаказу */
  | 'scan:bar'
  /** Править афишу, меню и столы */
  | 'catalog:write'
  /** Приход, списание, инвентаризация */
  | 'stock:write'
  /** Видеть заказы гостей и выручку */
  | 'orders:read'
  | 'analytics:read'
  /** Выдавать и отзывать роли */
  | 'staff:manage'
  /** Покупать билеты и напитки. У персонала этого права нет. */
  | 'purchase';

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  guest: ['purchase'],
  bartender: ['scan:bar', 'stock:write'],
  doorman: ['scan:entry'],
  manager: [
    'scan:entry',
    'scan:bar',
    'catalog:write',
    'stock:write',
    'orders:read',
    'analytics:read',
  ],
  admin: [
    'scan:entry',
    'scan:bar',
    'catalog:write',
    'stock:write',
    'orders:read',
    'analytics:read',
    'staff:manage',
  ],
};

export const ROLE_LABEL: Record<UserRole, string> = {
  guest: 'Гость',
  bartender: 'Бармен',
  doorman: 'Фейс-контроль',
  manager: 'Менеджер',
  admin: 'Администратор',
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  guest: 'Покупает билеты и напитки',
  bartender: 'Выдаёт напитки, ведёт склад',
  doorman: 'Пропускает гостей на входе',
  manager: 'Управляет клубом, кроме выдачи ролей',
  admin: 'Полный доступ, включая роли сотрудников',
};

/** Должности, которые можно назначить. Гость — не должность, а её отсутствие. */
export const ASSIGNABLE_ROLES: StaffRole[] = ['bartender', 'doorman', 'manager', 'admin'];

/**
 * Действующая роль: должность имеет силу только в рабочем режиме.
 *
 * Отдыхающий сотрудник — обычный гость: покупает билеты, копит баллы,
 * не видит сканер. Это и решает задачу «те, кто работал, тоже могут
 * отдыхать», не заводя людям второй аккаунт.
 */
export function effectiveRole(staffRole: StaffRole | null | undefined, atWork: boolean): UserRole {
  return atWork && staffRole ? staffRole : 'guest';
}

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Сотрудник — любой, кто не просто гость. Персонал не покупает. */
export function isStaff(role: UserRole): boolean {
  return role !== 'guest';
}
