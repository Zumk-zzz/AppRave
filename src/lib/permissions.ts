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

export type UserRole = 'guest' | 'bartender' | 'doorman' | 'manager' | 'admin';

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

/** Роли, которые можно выдать сотруднику. Гость назначается сам при входе. */
export const ASSIGNABLE_ROLES: UserRole[] = ['bartender', 'doorman', 'manager', 'admin'];

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
