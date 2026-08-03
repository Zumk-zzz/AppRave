import { InvalidCodeError, type AuthService, type User } from './types';

/** Код, который принимает мок. Показан на экране ввода. */
export const DEMO_CODE = '0000';

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

    const user: User = {
      id: 'u_demo',
      phone,
      name: 'Гость',
      tier: 'silver',
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
