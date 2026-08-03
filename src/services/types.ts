/**
 * Доменные модели приложения.
 *
 * Общие для всех экранов и для любой реализации сервисов — и для моков,
 * и для будущего бэкенда. Даты хранятся строками ISO, чтобы модель
 * пережила сериализацию в secure-store и в сетевой ответ без сюрпризов.
 */

export type LoyaltyTier = 'silver' | 'gold' | 'black';

export interface User {
  id: string;
  phone: string;
  name: string;
  tier: LoyaltyTier;
  /** Накопленные баллы лояльности */
  points: number;
  /** Номер клубной карты, он же содержимое QR */
  memberNo: string;
  joinedAt: string;
}

export type Genre = 'techno' | 'house' | 'hiphop' | 'disco';

export interface TicketType {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Сколько осталось. 0 — распродано. */
  available: number;
}

export interface ClubEvent {
  id: string;
  title: string;
  /** Строка под названием: резидент, серия вечеринок */
  subtitle: string;
  /** ISO — переживает сериализацию без сюрпризов с таймзонами */
  date: string;
  genre: Genre;
  ageLimit: number;
  lineup: string[];
  description: string;
  /**
   * Пара цветов для обложки. Афиши рисуются градиентом, а не картинками:
   * не зависят от сети, мгновенно грузятся и всегда попадают в стиль.
   */
  cover: readonly [string, string];
  tickets: TicketType[];
}

export interface EventsService {
  list(): Promise<ClubEvent[]>;
  byId(id: string): Promise<ClubEvent | null>;
}

export interface AuthService {
  /** Отправить код на номер. Возвращает, куда именно отправлен. */
  requestCode(phone: string): Promise<{ sentTo: string }>;
  /** Проверить код и получить пользователя. Бросает при неверном коде. */
  verifyCode(phone: string, code: string): Promise<User>;
}

/** Неверный код подтверждения — экран отличает эту ошибку от сетевой. */
export class InvalidCodeError extends Error {
  constructor() {
    super('Неверный код');
    this.name = 'InvalidCodeError';
  }
}
