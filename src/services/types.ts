/**
 * Доменные модели приложения.
 *
 * Общие для всех экранов и для любой реализации сервисов — и для моков,
 * и для будущего бэкенда. Даты хранятся строками ISO, чтобы модель
 * пережила сериализацию в secure-store и в сетевой ответ без сюрпризов.
 */

export type LoyaltyTier = 'silver' | 'gold' | 'black';

/** Роль определяет, видит ли пользователь раздел администрирования. */
export type UserRole = 'guest' | 'admin';

export interface User {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
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

export type OrderStatus = 'paid' | 'used' | 'cancelled';

export interface OrderLine {
  kind: 'ticket' | 'table' | 'bar';
  /** Идентификатор товара: нужен, чтобы вернуть его на склад при отмене */
  refId: string;
  title: string;
  subtitle?: string;
  price: number;
  qty: number;
  guests?: string[];
}

export interface Order {
  /** Человекочитаемый номер, он же показывается на фейс-контроле */
  id: string;
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
