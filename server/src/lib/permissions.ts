/**
 * Роли и права доступа.
 *
 * Код проверяет ПРАВА, а не роли. Роль — это просто именованный набор прав,
 * и такое разделение окупается на первом же «а пусть старший бармен ещё
 * и списывать умеет»: меняется один пресет, а не пятнадцать экранов.
 *
 * Этот файл продублирован в приложении (src/lib/permissions.ts) и
 * должен совпадать с ним дословно. Клиент прячет кнопки, сервер запрещает
 * действия — проверка нужна с обеих сторон, потому что спрятанная кнопка
 * защищает только от случайного нажатия, но не от подделанного запроса.
 */

/** Должность сотрудника. Закреплена за человеком и меняется редко. */
export type StaffRole = 'bartender' | 'doorman' | 'manager' | 'admin';

/**
 * Роль в системе: должность или её отсутствие.
 *
 * Что человек может прямо сейчас, из неё одной не следует: часть прав
 * появляется только с открытой сменой, а покупать может лишь тот, у кого
 * смены нет. Отвечает на это `canNow`, а не роль сама по себе.
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
  /**
   * Возвращать деньги за отменённую вечеринку.
   *
   * Отдельно от 'catalog:write' намеренно: отменить вечеринку — решение
   * операционное, его принимает управляющий. Вернуть за неё деньги —
   * решение денежное, и принимать его должен тот, кто за деньги отвечает.
   */
  | 'payments:refund'
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
    'payments:refund',
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
 * Роль, которую показываем человеку. Должность, а у гостя — «гость».
 *
 * Именно показываем: что человек может прямо сейчас, решает не она,
 * а `canNow` — часть прав зависит ещё и от открытой смены.
 */
export function effectiveRole(staffRole: StaffRole | null | undefined): UserRole {
  return staffRole ?? 'guest';
}

/**
 * Права, которые действуют только на открытой смене.
 *
 * Пропускать людей и выдавать напитки можно, только когда ты в зале:
 * каждое такое действие попадает в конкретную смену, и без неё нельзя
 * ответить на главный вопрос — кто стоял на входе, когда всё случилось.
 *
 * Остальное к присутствию не привязано. Афишу управляющий правит днём
 * из дома, и заставлять его ради этого «открыть смену» бессмысленно.
 */
export const SHIFT_ONLY: readonly Permission[] = ['scan:entry', 'scan:bar'];

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Что человек может прямо сейчас.
 *
 * Смена решает две вещи, и обе — про совмещение работы и отдыха:
 *
 *  - покупает тот, кто сейчас не на смене. Бармен в выходной приходит
 *    отдыхать и берёт коктейль наравне со всеми, а на смене не покупает:
 *    это исказило бы выручку и позволило бы выписать себе билет мимо кассы;
 *  - пропускать и выдавать можно только на смене — см. SHIFT_ONLY.
 */
export function canNow(
  staffRole: StaffRole | null | undefined,
  onShift: boolean,
  permission: Permission,
): boolean {
  if (permission === 'purchase') return !onShift;
  if (!staffRole) return false;
  if (!onShift && SHIFT_ONLY.includes(permission)) return false;

  return can(staffRole, permission);
}

export function canAny(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Сотрудник — любой, кто не просто гость. Персонал не покупает. */
export function isStaff(role: UserRole): boolean {
  return role !== 'guest';
}
