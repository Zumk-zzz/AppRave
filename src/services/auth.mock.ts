import { parseContact } from '@/src/lib/contact';
import { ROLE_LABEL, type StaffRole } from '@/src/lib/permissions';
import { tierForPoints } from '@/src/lib/loyalty';
import { mockOrdersService } from './orders.mock';
import { InvalidCodeError, type AuthService, type User } from './types';

/** Свои заказы из локального хранилища — источник для пересчёта баллов. */
const mockCatalogOrders = () => mockOrdersService.mine();

/** Код, который принимает мок. Показан на экране ввода. */
export const DEMO_CODE = '0000';

/**
 * Демонстрационные контакты сотрудников.
 *
 * На бэкенде должность хранится у пользователя и выдаётся через раздел
 * «Сотрудники». Здесь, пока приложение работает на моках, она выводится
 * из контакта — иначе каждую роль нельзя было бы проверить на устройстве.
 */
export const STAFF_PHONES: Record<string, StaffRole> = {
  '+79000000000': 'admin',
  '+79000000001': 'manager',
  '+79000000002': 'bartender',
  '+79000000003': 'doorman',
};

/** Вход по этому номеру даёт роль администратора. */
export const ADMIN_PHONE = '+79000000000';

function staffRoleFor(value: string): StaffRole | undefined {
  return STAFF_PHONES[value];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Мок авторизации: код всегда 0000, пользователь собирается на лету.
 * Заменяется реализацией поверх бэкенда без изменений в экранах —
 * они знают только про интерфейс AuthService.
 */
export const mockAuthService: AuthService = {
  async requestCode(contact) {
    await delay(700);

    const parsed = parseContact(contact);
    if (!parsed) throw new Error('Некорректный контакт');

    return { sentTo: parsed.value, channel: parsed.channel };
  },

  async verifyCode(contact, code) {
    await delay(900);

    if (code !== DEMO_CODE) throw new InvalidCodeError();

    const parsed = parseContact(contact);
    if (!parsed) throw new InvalidCodeError();

    const staffRole = staffRoleFor(parsed.value);

    const user: User = {
      // Идентификатор от контакта, а не общий 'u_demo': иначе два разных
      // гостя выглядели бы одним человеком и делили заказы.
      id: staffRole ? `u_${staffRole}` : `u_${parsed.value}`,
      phone: parsed.channel === 'phone' ? parsed.value : undefined,
      email: parsed.channel === 'email' ? parsed.value : undefined,
      name: staffRole ? ROLE_LABEL[staffRole] : 'Гость',
      staffRole,
      tier: 'silver',
      // Баллы копят все: сотрудник в выходной покупает как обычный гость
      points: 120,
      memberNo: buildMemberNo(parsed.value),
      joinedAt: new Date().toISOString(),
    };

    return user;
  },

  async linkContact(user, contact, code) {
    await delay(700);

    if (code !== DEMO_CODE) throw new InvalidCodeError();

    const parsed = parseContact(contact);
    if (!parsed) throw new InvalidCodeError();

    // Аккаунт остаётся тем же — добавляется только способ войти в него
    return parsed.channel === 'phone'
      ? { ...user, phone: parsed.value }
      : { ...user, email: parsed.value };
  },

  /**
   * Баллы пересчитываются по состоявшимся заказам.
   *
   * Без сервера их некому уменьшить при отмене: начисление делает
   * покупка, и если просто вычитать при отмене, счётчик разойдётся
   * с историей на первой же ошибке. Здесь он выводится из заказов,
   * поэтому сойдётся всегда.
   */
  async refresh(user) {
    const orders = await mockCatalogOrders();
    const points = orders
      .filter((o) => o.status === 'paid' || o.status === 'used')
      .reduce((sum, o) => sum + o.pointsEarned, 0);

    return { ...user, points, tier: tierForPoints(points) };
  },
};

/**
 * Номер карты вида AR-4821.
 * В моке коллизии не страшны, на сервере их разводит allocateMemberNo.
 */
function buildMemberNo(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= 4) return `AR-${digits.slice(-4)}`;

  let hash = 0;
  for (let i = 0; i < contact.length; i++) {
    hash = (hash * 31 + contact.charCodeAt(i)) % 10000;
  }
  return `AR-${String(hash).padStart(4, '0')}`;
}
