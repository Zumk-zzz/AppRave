/**
 * Доменные модели приложения.
 *
 * Общие для всех экранов и для любой реализации сервисов — и для моков,
 * и для будущего бэкенда. Даты хранятся строками ISO, чтобы модель
 * пережила сериализацию в secure-store и в сетевой ответ без сюрпризов.
 */

import type { StaffRole, UserRole } from '@/src/lib/permissions';

export type { StaffRole, UserRole };

export type LoyaltyTier = 'silver' | 'gold' | 'black';

export interface User {
  id: string;
  /** Телефон или почта — хотя бы одно. Оба служат для входа. */
  phone?: string;
  email?: string;
  name: string;
  /**
   * Должность. Отсутствует у обычного гостя.
   *
   * Отдельно от действующей роли: сотрудник в выходной приходит отдыхать
   * и покупает наравне со всеми. Что он может прямо сейчас, решает
   * рабочий режим, а не эта строка.
   */
  staffRole?: StaffRole;
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

/**
 * Статус заказа целиком.
 *
 * `pending` — товар зарезервирован, оплата ещё не подтверждена; резерв
 * сгорает сам и переводит заказ в `expired`. `used` выставляется
 * автоматически, когда выданы все строки.
 */
export type OrderStatus = 'pending' | 'paid' | 'used' | 'cancelled' | 'expired';

/** Что именно гасится при сканировании. */
export type RedeemKind = 'ticket' | 'bar';

export interface OrderLine {
  /**
   * Идентификатор строки. Выдаётся сервером и нужен, чтобы отменить или
   * выдать именно эту позицию: порядковый номер в массиве для этого не
   * годится — состав заказа у сотрудника и у гостя может прийти по-разному.
   */
  id: string;
  kind: 'ticket' | 'table' | 'bar';
  /** Идентификатор товара: нужен, чтобы вернуть его на склад при отмене */
  refId: string;
  title: string;
  subtitle?: string;
  price: number;
  qty: number;
  guests?: string[];
  /**
   * Сколько единиц уже выдано или использовано.
   *
   * Гасится строка, а не весь заказ: на вход проходят один раз, а напитки
   * забирают порциями и за несколько подходов к бару. Один общий флаг
   * «использован» означал бы, что после первого коктейля билет перестаёт
   * пускать внутрь.
   */
  redeemed: number;
  /** Сколько единиц отменено гостем до выдачи */
  cancelled?: number;
}

export interface Order {
  /** Внутренний идентификатор: по нему заказ открывается и меняется */
  id: string;
  /** Человекочитаемый номер вида ORD-8F3A: он в QR и его называют на входе */
  number: string;
  createdAt: string;
  eventId?: string;
  eventTitle?: string;
  eventDate?: string;
  lines: OrderLine[];
  total: number;
  pointsEarned: number;
  status: OrderStatus;
  /** Содержимое QR-кода — то, что сканируют на входе */
  qrPayload: string;
  /**
   * Кто купил. Заполняется только в списках для персонала: гостю в своём
   * заказе это поле не нужно, а показывать чужие контакты всем подряд —
   * лишнее. Бармен видит имя, фейсер и управляющий ещё и контакт.
   */
  guest?: { name: string; contact?: string };
}

/** Строка корзины, отправляемая на оформление. */
export interface CheckoutItem {
  kind: 'ticket' | 'table' | 'bar';
  refId: string;
  title: string;
  subtitle?: string;
  price: number;
  qty: number;
  eventId?: string;
  guests?: string[];
}

/**
 * Заказы: покупка, отмена и выдача.
 *
 * Все изменения заказа проходят здесь, а не в экранах: на сервере за
 * одним действием стоит транзакция, которая возвращает товар в продажу,
 * и повторять эту логику на телефоне нельзя — копии разойдутся.
 */
export interface OrdersService {
  /** Мои заказы, новые первыми. */
  mine(): Promise<Order[]>;
  /**
   * Оформить корзину. Возвращает созданные заказы — по одному на вечеринку:
   * на входе сканируют один код за одну ночь, а не общий чек на все даты.
   */
  checkout(items: CheckoutItem[], events: ClubEvent[], user: User): Promise<Order[]>;
  cancel(orderId: string): Promise<Order>;
  /** Отменить часть позиции: гость передумал брать один коктейль из трёх. */
  cancelLine(orderId: string, lineId: string, count: number): Promise<Order>;
  /** Заказ по номеру из QR. null — такого заказа нет. */
  byNumber(number: string): Promise<Order | null>;
  /** Пропустить гостей: гасит все билетные строки разом. */
  admit(order: Order): Promise<Order>;
  /** Выдать напитки по одной позиции, возможно частично. */
  issue(order: Order, lineId: string, count: number): Promise<Order>;
  /** Заказы смены: список на входе, очередь бара, сводка администратора. */
  forStaff(eventId?: string): Promise<Order[]>;
}

export type BarCategory = 'cocktails' | 'shots' | 'champagne' | 'strong' | 'soft';

export interface BarItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: BarCategory;
  /** Объём или крепость — короткая подпись под названием */
  volume: string;
  /** Хит продаж: выносится меткой на карточке */
  popular?: boolean;
  available: boolean;
}

export interface BarService {
  menu(): Promise<BarItem[]>;
}

export type TableZone = 'vip' | 'lounge' | 'bar';

export interface ClubTable {
  id: string;
  /** Короткая метка на схеме: V1, L3 */
  label: string;
  zone: TableZone;
  seats: number;
  /** Минимальный депозит; полностью идёт в счёт заказа */
  deposit: number;
  /** Занят на конкретную дату — вычисляется, в каталоге не хранится */
  taken: boolean;
  /**
   * Снят с продажи администратором: ремонт, служебная бронь.
   * В отличие от taken действует на все даты сразу.
   */
  blocked: boolean;
  /**
   * Положение и размер на схеме зала в долях от 0 до 1.
   * Доли, а не пиксели, — схема тянется под любую ширину экрана.
   */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BookingService {
  /** Столы на конкретное событие — занятость зависит от даты */
  tablesFor(eventId: string): Promise<ClubTable[]>;
}

export type StockMoveKind = 'receipt' | 'writeoff' | 'sale' | 'correction';

export interface StockItem {
  barItemId: string;
  /** Остаток на складе */
  qty: number;
  /** Единица измерения: бутылки, порции, банки */
  unit: string;
  /** Ниже этого значения позиция попадает в «заканчивается» */
  lowThreshold: number;
}

export interface StockMove {
  id: string;
  barItemId: string;
  kind: StockMoveKind;
  /** Со знаком: приход положительный, расход отрицательный */
  delta: number;
  comment?: string;
  createdAt: string;
  /** Для продаж — из какого заказа списано */
  orderId?: string;
}

export interface InventoryService {
  stock(): Promise<StockItem[]>;
  /** Журнал движений, новые первыми. Без аргумента — по всем позициям. */
  moves(barItemId?: string): Promise<StockMove[]>;
  apply(input: {
    barItemId: string;
    kind: StockMoveKind;
    delta: number;
    comment?: string;
    orderId?: string;
  }): Promise<void>;
}

/** Операции записи. Доступны только пользователю с ролью admin. */
export interface AdminService {
  saveEvent(event: ClubEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  saveBarItem(item: BarItem, stock?: Partial<StockItem>): Promise<void>;
  deleteBarItem(id: string): Promise<void>;
  saveTable(table: ClubTable): Promise<void>;
  /**
   * Изменить остаток билетов. Положительное qty — продажа,
   * отрицательное — возврат при отмене заказа.
   */
  consumeTickets(eventId: string, ticketTypeId: string, qty: number): Promise<void>;
  /** Вернуть каталог к демонстрационным данным */
  resetCatalog(): Promise<void>;
}

export interface AuthService {
  /** Отправить код на телефон или почту. Возвращает, куда именно отправлен. */
  requestCode(contact: string): Promise<{ sentTo: string; channel: 'phone' | 'email' }>;
  /** Проверить код и получить пользователя. Бросает при неверном коде. */
  verifyCode(contact: string, code: string): Promise<User>;
  /** Привязать второй канал к текущему аккаунту. */
  linkContact(user: User, contact: string, code: string): Promise<User>;
}

/** Неверный код подтверждения — экран отличает эту ошибку от сетевой. */
export class InvalidCodeError extends Error {
  constructor() {
    super('Неверный код');
    this.name = 'InvalidCodeError';
  }
}
