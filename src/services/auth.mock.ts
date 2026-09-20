import { ROLE_LABEL, type StaffRole, type UserRole } from '@/src/lib/permissions';
import { InvalidCodeError, type AuthService, type User } from './types';

/** Код, который принимает мок. Показан на экране ввода. */
export const DEMO_CODE = '0000';

/**
 * Демонстрационные номера сотрудников.
 *
 * На бэкенде роль хранится у пользователя и выдаётся через раздел
 * «Сотрудники». Здесь, пока приложение работает на моках, роль выводится
 * из номера — иначе каждую роль нельзя было бы проверить на устройстве.
 */
export const STAFF_PHONES: Record<string, StaffRole> = {
  '+79000000000': 'admin',
  '+79000000001': 'manager',
  '+79000000002': 'bartender',
  '+79000000003': 'doorman',
};

/** Вход по этому номеру даёт роль администратора. */
export const ADMIN_PHONE = '+79000000000';

function staffRoleFor(phone: string): StaffRole | undefined {
  return STAFF_PHONES[phone];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Мок авторизации: код всегда 0000, пользователь собирается на лету.
 * Заменяется реализацией поверх бэкенда без изменений в экранах —
 * они знают только про интерфейс AuthService.
 */
export const mockAuthService: AuthService = {
  async requestCode(phone) {
    await delay(700);
    return { sentTo: phone };
  },

  async verifyCode(phone, code) {
    await delay(900);

    if (code !== DEMO_CODE) {
      throw new InvalidCodeError();
    }

    const staffRole = staffRoleFor(phone);

    const user: User = {
      id: staffRole ? `u_${staffRole}` : 'u_demo',
      phone,
      name: staffRole ? ROLE_LABEL[staffRole] : 'Гость',
      staffRole,
      tier: 'silver',
      // Баллы копят все: сотрудник в выходной покупает как обычный гость
      points: 120,
      memberNo: buildMemberNo(phone),
      joinedAt: new Date().toISOString(),
    };

    return user;
  },
};

/** Номер карты вида AR-4821 — стабильный для одного и того же телефона. */
function buildMemberNo(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const tail = digits.slice(-4).padStart(4, '0');
  return `AR-${tail}`;
}
