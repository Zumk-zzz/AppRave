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
   * Что человек может прямо сейчас, из неё одной не следует: сотрудник
   * в выходной приходит отдыхать и покупает наравне со всеми. Решает
   * открытая смена, а не эта строка.
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
  /** Сколько осталось. 0 — распродано. Считается, а не хранится. */
  available: number;
  /**
   * Сколько выпущено. Это и правит администратор.
   *
   * Отдельно от остатка: правка тиража во время продаж не должна
   * затирать проданное. У записей, сделанных до появления поля, его нет —
   * тогда тираж равен остатку.
   */
  quantity?: number;
}

/**
 * Состояние вечеринки в афише.
 *
 * `draft` — готовится, гостям не видна. `cancelled` — отменена клубом;
 * из афиши пропадает, но остаётся в системе, потому что по ней есть
 * проданные билеты, которые надо вернуть.
 */
export type EventStatus = 'draft' | 'published' | 'cancelled';

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
  /** По умолчанию опубликована: у записей, сделанных до появления поля, его нет */
  status?: EventStatus;
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
 * автоматически, когда выданы все строки. `refunded` — клуб отменил
 * вечеринку и вернул деньги; в отличие от `cancelled` это решение
 * не гостя, и разница видна и ему, и в отчётах.
 */
export type OrderStatus = 'pending' | 'paid' | 'used' | 'cancelled' | 'expired' | 'refunded';

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
  /**
   * Пропустить гостей: гасит все билетные строки разом.
   *
   * `manual` — пропуск без кода, когда у гостя сел телефон. В журнале
   * такие отмечаются отдельно: это не то же самое, что проход по QR.
   */
  admit(order: Order, manual?: boolean): Promise<Order>;
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

export type StockMoveKind = 'receipt' | 'writeoff' | 'sale' | 'refund' | 'correction';

/**
 * Движения, которые заводит человек.
 *
 * Продажу и возврат пишет сам заказ, в одной транзакции со списанием —
 * руками их не заводят, иначе склад разошёлся бы с продажами.
 */
export type StockAdjustKind = 'receipt' | 'writeoff' | 'correction';

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
  /**
   * Приход, списание, инвентаризация.
   *
   * Продажи и возвраты сюда не ходят: их пишет сам заказ, в одной
   * транзакции со списанием. Отдельный вызов из приложения означал бы,
   * что склад и продажа могут разойтись при обрыве связи.
   */
  apply(input: {
    barItemId: string;
    kind: StockAdjustKind;
    delta: number;
    comment?: string;
  }): Promise<void>;
}

/** Стол без привязки к дате: так его видит и правит администратор. */
export type TableLayout = Omit<ClubTable, 'taken'>;

/**
 * Правка каталога. Доступна только тому, у кого есть право `catalog:write`.
 *
 * Создание и обновление разделены намеренно. Одна ручка «сохранить»
 * решала бы, что делать, по наличию идентификатора, а у нового события
 * он берётся из времени на телефоне — и однажды совпал бы с чужим.
 */
export interface AdminService {
  /**
   * Все вечеринки: черновики, афиша, прошедшие и отменённые.
   *
   * Отдельно от `EventsService.list`, который отдаёт афишу — то, что
   * можно купить. Раньше список был один, и администратор, открыв
   * приложение как гость, видел в афише свои черновики.
   */
  events(): Promise<ClubEvent[]>;
  createEvent(event: ClubEvent): Promise<void>;
  updateEvent(event: ClubEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;

  createBarItem(item: BarItem, stock?: Partial<StockItem>): Promise<void>;
  updateBarItem(item: BarItem, stock?: Partial<StockItem>): Promise<void>;
  deleteBarItem(id: string): Promise<void>;

  /** Схема зала целиком: без события и без занятости. */
  tables(): Promise<TableLayout[]>;
  createTable(table: TableLayout): Promise<void>;
  updateTable(table: TableLayout): Promise<void>;

  /** Что произойдёт при возврате: сколько заказов, гостей и денег. */
  refundPreview(eventId: string): Promise<RefundPreview>;
  /**
   * Вернуть деньги всем, кто купил билеты на отменённую вечеринку.
   *
   * `confirm` — название вечеринки слово в слово. Проверяется и на
   * сервере: это единственное действие, которое двигает деньги обратно,
   * и одного «вы уверены?» для него мало.
   */
  refundEvent(eventId: string, confirm: string): Promise<RefundResult>;

  /**
   * Вернуть каталог к демонстрационным данным.
   *
   * Только для автономного режима. На сервере это стёрло бы проданное
   * вместе с историей, поэтому там ручки нет вовсе.
   */
  resetCatalog(): Promise<void>;
}

export interface RefundPreview {
  /** Готова ли вечеринка к возврату: деньги возвращают только по отменённой */
  ready: boolean;
  status: EventStatus;
  orders: number;
  guests: number;
  /** Сумма в рублях */
  total: number;
}

export interface RefundResult {
  refunded: number;
  guests: number;
  total: number;
}

// --- Смена, журнал, сотрудники, стоп-лист ---

export type StaffActionKind =
  | 'entry_admitted'
  | 'entry_manual'
  | 'bar_issued'
  | 'shift_opened'
  | 'shift_closed'
  | 'role_granted'
  | 'role_revoked'
  | 'stock_adjusted';

/**
 * Запись журнала.
 *
 * В клубе это не гигиена, а деньги: единственный способ разобраться,
 * куда делся алкоголь, — знать, кто и что выдал в конкретную минуту.
 */
export interface StaffAction {
  id: string;
  kind: StaffActionKind;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  orderId?: string;
  /** Короткое описание для журнала: «Негрони × 2», «2 гостя» */
  summary?: string;
  shiftId?: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  openedAt: string;
  closedAt?: string;
  /** Заметка при закрытии: расхождения, происшествия */
  note?: string;
}

/** Смена другого сотрудника — как её видит управляющий. */
export interface TeamShift extends Shift {
  staff: { name: string; role: UserRole };
  /** Сколько действий в эту смену: проходы, выдачи, правки склада */
  actions: number;
}

export interface StaffMember {
  id: string;
  name: string;
  /** Телефон или почта — чем сотрудник входит */
  contact: string;
  role: UserRole;
}

export interface BanEntry {
  id: string;
  /** Контакт гостя: телефон или почта */
  contact: string;
  /** Имя на момент отказа — контакт может смениться, память должна остаться */
  name?: string;
  reason: string;
  createdAt: string;
  /** Снятие отказа вместо удаления: история не должна пропадать */
  liftedAt?: string;
}

/**
 * Смена, журнал, сотрудники и стоп-лист.
 *
 * Журнал только читается. Записывает его тот, кто выполняет действие:
 * на сервере — сам сервер, в одной операции с выдачей. Принимать записи
 * от приложения нельзя — журналу, в который можно дописать что угодно,
 * незачем верить.
 */
export interface StaffService {
  /** Моя открытая смена, если она есть. */
  currentShift(user: User): Promise<Shift | null>;
  openShift(user: User): Promise<Shift>;
  closeShift(user: User, note?: string): Promise<void>;

  /** Журнал: сотрудник видит свои действия, управляющий — все. */
  actions(limit?: number): Promise<StaffAction[]>;

  /**
   * Смены команды: кто в зале сейчас и кто работал раньше.
   *
   * Управляющему смену открывать незачем — ему нужно видеть чужие.
   * Открытые идут первыми: на них смотрят в первую очередь.
   */
  teamShifts(limit?: number): Promise<TeamShift[]>;

  members(): Promise<StaffMember[]>;
  addMember(input: { contact: string; name: string; role: UserRole }): Promise<void>;
  removeMember(id: string): Promise<void>;

  /** Стоп-лист. Со снятыми отказами — когда нужна история. */
  bans(all?: boolean): Promise<BanEntry[]>;
  addBan(input: { contact: string; name?: string; reason: string }): Promise<void>;
  liftBan(id: string): Promise<void>;
}

export interface AuthService {
  /** Отправить код на телефон или почту. Возвращает, куда именно отправлен. */
  requestCode(contact: string): Promise<{ sentTo: string; channel: 'phone' | 'email' }>;
  /** Проверить код и получить пользователя. Бросает при неверном коде. */
  verifyCode(contact: string, code: string): Promise<User>;
  /** Привязать второй канал к текущему аккаунту. */
  linkContact(user: User, contact: string, code: string): Promise<User>;
  /**
   * Перечитать профиль.
   *
   * Баллы и уровень меняются не только при покупке: отмена заказа их
   * забирает обратно, возврат за отменённую вечеринку — тоже. Считает
   * это сервер, и приложению остаётся спросить, а не считать заново
   * своей копией формулы.
   */
  refresh(user: User): Promise<User>;
}

/** Неверный код подтверждения — экран отличает эту ошибку от сетевой. */
export class InvalidCodeError extends Error {
  constructor() {
    super('Неверный код');
    this.name = 'InvalidCodeError';
  }
}
