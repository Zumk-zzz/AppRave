import type {
  BarItem,
  ClubEvent,
  ClubTable,
  Order,
  OrderLine,
  OrderStatus,
  StockItem,
  StockMove,
  TableLayout,
  User,
} from '@/src/services/types';

/**
 * Перевод между формой сервера и моделью приложения.
 *
 * Сервер хранит деньги в копейках и отдаёт их целыми числами — так
 * задумано, дробей в JSON быть не должно. Приложение везде считает
 * в рублях, поэтому граница проходит ровно здесь, в одном файле,
 * а не расползается делениями на сто по экранам.
 */

export const toRubles = (kopecks: number): number => Math.round(kopecks) / 100;

/** Обратный перевод, для отправки на сервер. Округление обязательно:
 *  рубль с копейками, умноженный на сто, в double даёт 8999.999999. */
export const toKopecks = (rubles: number): number => Math.round(rubles * 100);

interface ApiEvent {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  genre: ClubEvent['genre'];
  ageLimit: number;
  lineup: string[];
  description: string;
  cover: [string, string];
  status: 'draft' | 'published' | 'cancelled';
  tickets: {
    id: string;
    name: string;
    description: string;
    priceKopecks: number;
    available: number;
    quantity: number;
  }[];
}

export function mapEvent(e: ApiEvent): ClubEvent {
  return {
    id: e.id,
    title: e.title,
    subtitle: e.subtitle,
    date: e.date,
    genre: e.genre,
    ageLimit: e.ageLimit,
    lineup: e.lineup,
    description: e.description,
    cover: e.cover,
    status: e.status,
    tickets: e.tickets.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: toRubles(t.priceKopecks),
      available: t.available,
      quantity: t.quantity,
    })),
  };
}

interface ApiBarItem {
  id: string;
  name: string;
  description: string;
  priceKopecks: number;
  category: BarItem['category'];
  volume: string;
  popular: boolean;
  available: boolean;
}

export function mapBarItem(i: ApiBarItem): BarItem {
  return {
    id: i.id,
    name: i.name,
    description: i.description,
    price: toRubles(i.priceKopecks),
    category: i.category,
    volume: i.volume,
    popular: i.popular,
    available: i.available,
  };
}

interface ApiTable {
  id: string;
  label: string;
  zone: ClubTable['zone'];
  seats: number;
  depositKopecks: number;
  blocked: boolean;
  taken: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function mapTable(t: ApiTable): ClubTable {
  return {
    id: t.id,
    label: t.label,
    zone: t.zone,
    seats: t.seats,
    deposit: toRubles(t.depositKopecks),
    blocked: t.blocked,
    taken: t.taken,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
  };
}

interface ApiUser {
  id: string;
  phone: string | null;
  email: string | null;
  name: string;
  role: 'guest' | 'bartender' | 'doorman' | 'manager' | 'admin';
  tier: User['tier'];
  points: number;
  memberNo: string;
  joinedAt: string;
}

export function mapUser(u: ApiUser): User {
  return {
    id: u.id,
    phone: u.phone ?? undefined,
    email: u.email ?? undefined,
    name: u.name,
    // На сервере поле называется role и хранит должность; guest означает
    // её отсутствие. В приложении это staffRole, а действующая роль
    // вычисляется из рабочего режима.
    staffRole: u.role === 'guest' ? undefined : u.role,
    tier: u.tier,
    points: u.points,
    memberNo: u.memberNo,
    joinedAt: u.joinedAt,
  };
}

interface ApiOrderLine {
  id: string;
  kind: OrderLine['kind'];
  refId: string;
  title: string;
  subtitle: string | null;
  priceKopecks: number;
  qty: number;
  redeemed: number;
  cancelledQty: number;
  guests?: string[];
}

interface ApiOrder {
  id: string;
  number: string;
  status: 'draft' | 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded' | 'used';
  totalKopecks: number;
  pointsEarned: number;
  createdAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  event: { id: string; title: string; date: string } | null;
  lines: ApiOrderLine[];
  qrPayload: string;
  guest?: { name: string; contact: string | null };
}

/**
 * Статусы сервера богаче: у него есть черновик и возврат средств.
 * Приложению эти различия не нужны — на экране от них ничего не зависит,
 * а разбирать семь состояний в каждом бейдже было бы лишним.
 */
const STATUS: Record<ApiOrder['status'], OrderStatus> = {
  draft: 'pending',
  pending: 'pending',
  paid: 'paid',
  used: 'used',
  expired: 'expired',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

export function mapOrder(o: ApiOrder): Order {
  return {
    id: o.id,
    number: o.number,
    createdAt: o.createdAt,
    eventId: o.event?.id,
    eventTitle: o.event?.title,
    eventDate: o.event?.date,
    lines: o.lines.map(mapOrderLine),
    total: toRubles(o.totalKopecks),
    pointsEarned: o.pointsEarned,
    status: STATUS[o.status],
    qrPayload: o.qrPayload,
    guest: o.guest ? { name: o.guest.name, contact: o.guest.contact ?? undefined } : undefined,
  };
}

function mapOrderLine(l: ApiOrderLine): OrderLine {
  return {
    id: l.id,
    kind: l.kind,
    refId: l.refId,
    title: l.title,
    subtitle: l.subtitle ?? undefined,
    price: toRubles(l.priceKopecks),
    qty: l.qty,
    redeemed: l.redeemed,
    cancelled: l.cancelledQty,
    guests: l.guests,
  };
}

interface ApiTableLayout {
  id: string;
  label: string;
  zone: ClubTable['zone'];
  seats: number;
  depositKopecks: number;
  blocked: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Стол в схеме зала: без события занятости не существует. */
export function mapTableLayout(t: ApiTableLayout): TableLayout {
  return {
    id: t.id,
    label: t.label,
    zone: t.zone,
    seats: t.seats,
    deposit: toRubles(t.depositKopecks),
    blocked: t.blocked,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
  };
}

interface ApiStockItem {
  barItemId: string;
  qty: number;
  unit: string;
  lowThreshold: number;
}

export function mapStockItem(s: ApiStockItem): StockItem {
  return { barItemId: s.barItemId, qty: s.qty, unit: s.unit, lowThreshold: s.lowThreshold };
}

interface ApiStockMove {
  id: string;
  barItemId: string;
  kind: StockMove['kind'];
  delta: number;
  comment: string | null;
  orderId: string | null;
  createdAt: string;
}

export function mapStockMove(m: ApiStockMove): StockMove {
  return {
    id: m.id,
    barItemId: m.barItemId,
    kind: m.kind,
    delta: m.delta,
    comment: m.comment ?? undefined,
    orderId: m.orderId ?? undefined,
    createdAt: m.createdAt,
  };
}

export type {
  ApiBarItem,
  ApiEvent,
  ApiOrder,
  ApiStockItem,
  ApiStockMove,
  ApiTable,
  ApiTableLayout,
  ApiUser,
};
