import type { BarItem, ClubEvent, ClubTable, User } from '@/src/services/types';

/**
 * Перевод между формой сервера и моделью приложения.
 *
 * Сервер хранит деньги в копейках и отдаёт их целыми числами — так
 * задумано, дробей в JSON быть не должно. Приложение везде считает
 * в рублях, поэтому граница проходит ровно здесь, в одном файле,
 * а не расползается делениями на сто по экранам.
 */

const toRubles = (kopecks: number): number => Math.round(kopecks) / 100;

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
    tickets: e.tickets.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: toRubles(t.priceKopecks),
      available: t.available,
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

export type { ApiBarItem, ApiEvent, ApiTable, ApiUser };
