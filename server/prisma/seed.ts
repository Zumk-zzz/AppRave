import { PrismaClient, type BarCategory, type Genre, type TableZone } from '@prisma/client';

import { rub } from '../src/lib/money.js';

const db = new PrismaClient();

/** Ближайшая ночь через N дней. */
function nightAfter(days: number, hour = 23): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const EVENTS = [
  {
    title: 'NEON RITUAL',
    subtitle: 'Резиденты клуба',
    startsAt: nightAfter(1),
    genre: 'techno' as Genre,
    ageLimit: 18,
    lineup: ['KIRA VOID', 'DEEP/SHIFT', 'ANNA GRAY'],
    description:
      'Главная техно-ночь недели. Три резидента, дым до потолка и саунд-система, ради которой сюда и приходят.',
    cover: ['#FF2E93', '#7A1350'],
    tickets: [
      { name: 'Standard', description: 'Вход до 01:00', price: rub(1500), quantity: 42 },
      { name: 'Fast Track', description: 'Без очереди, любое время', price: rub(2500), quantity: 12 },
      { name: 'VIP', description: 'Отдельный вход, гардероб и welcome-шот', price: rub(4500), quantity: 6 },
    ],
  },
  {
    title: 'AFTERGLOW',
    subtitle: 'House all night',
    startsAt: nightAfter(3),
    genre: 'house' as Genre,
    ageLimit: 18,
    lineup: ['SOLARIS', 'MIKA DUB'],
    description: 'Мягкий хаус, тёплый свет и много воздуха. Для тех, кто хочет и танцевать, и слышать собеседника.',
    cover: ['#00E5FF', '#0A3D52'],
    tickets: [
      { name: 'Standard', description: 'Вход до 02:00', price: rub(1200), quantity: 88 },
      { name: 'VIP', description: 'Отдельный вход и гардероб', price: rub(3500), quantity: 10 },
    ],
  },
  {
    title: 'LOW END',
    subtitle: 'Hip-hop & RnB',
    startsAt: nightAfter(5),
    genre: 'hiphop' as Genre,
    ageLimit: 18,
    lineup: ['DJ SEVEN', 'MC RAVA', 'BOOM CLAP'],
    description: 'Классика и свежие релизы, живой MC и баттл-сет в середине ночи.',
    cover: ['#FF5C00', '#5A1E00'],
    tickets: [
      { name: 'Standard', description: 'Вход до 01:30', price: rub(1000), quantity: 120 },
      { name: 'Fast Track', description: 'Без очереди', price: rub(1800), quantity: 25 },
    ],
  },
  {
    title: 'MIRRORBALL',
    subtitle: 'Disco revival',
    startsAt: nightAfter(8),
    genre: 'disco' as Genre,
    ageLimit: 21,
    lineup: ['VELVET SUN', 'DISCO PATROL'],
    description: 'Зеркальный шар, костюмы семидесятых и только пластинки. Дресс-код обязателен.',
    cover: ['#E8B923', '#5A4300'],
    tickets: [
      { name: 'Standard', description: 'Вход до 01:00', price: rub(1400), quantity: 60 },
      { name: 'VIP', description: 'Только вход, стол не входит', price: rub(3900), quantity: 8 },
    ],
  },
  {
    title: 'BLACKOUT',
    subtitle: 'Hard techno · 12 часов',
    startsAt: nightAfter(12),
    genre: 'techno' as Genre,
    ageLimit: 21,
    lineup: ['NULL POINTER', 'KIRA VOID', 'HEXA', 'STROBE'],
    description: 'Двенадцать часов без остановки, четыре сцены и полная темнота с одним стробоскопом.',
    cover: ['#8B5CF6', '#2B1857'],
    tickets: [
      { name: 'Standard', description: 'Вход до 03:00', price: rub(2200), quantity: 30 },
      { name: 'Fast Track', description: 'Без очереди, любое время', price: rub(3400), quantity: 4 },
      // Намеренно распродан: нужен для проверки поведения интерфейса
      { name: 'VIP', description: 'Все сцены, лаунж и отдельный бар', price: rub(6900), quantity: 0 },
    ],
  },
];

const TABLES = [
  { label: 'V1', zone: 'vip', seats: 6, deposit: rub(25000), x: 0.03, y: 0.16, w: 0.17, h: 0.11 },
  { label: 'V2', zone: 'vip', seats: 6, deposit: rub(25000), x: 0.03, y: 0.31, w: 0.17, h: 0.11 },
  { label: 'V3', zone: 'vip', seats: 8, deposit: rub(40000), x: 0.8, y: 0.16, w: 0.17, h: 0.11 },
  { label: 'V4', zone: 'vip', seats: 8, deposit: rub(40000), x: 0.8, y: 0.31, w: 0.17, h: 0.11 },
  { label: 'L1', zone: 'lounge', seats: 4, deposit: rub(12000), x: 0.05, y: 0.56, w: 0.2, h: 0.11 },
  { label: 'L2', zone: 'lounge', seats: 4, deposit: rub(12000), x: 0.28, y: 0.56, w: 0.2, h: 0.11 },
  { label: 'L3', zone: 'lounge', seats: 6, deposit: rub(18000), x: 0.51, y: 0.56, w: 0.2, h: 0.11 },
  { label: 'L4', zone: 'lounge', seats: 6, deposit: rub(18000), x: 0.74, y: 0.56, w: 0.2, h: 0.11 },
  { label: 'B1', zone: 'bar', seats: 2, deposit: rub(6000), x: 0.05, y: 0.74, w: 0.2, h: 0.1 },
  { label: 'B2', zone: 'bar', seats: 2, deposit: rub(6000), x: 0.28, y: 0.74, w: 0.2, h: 0.1 },
  { label: 'B3', zone: 'bar', seats: 3, deposit: rub(8000), x: 0.51, y: 0.74, w: 0.2, h: 0.1 },
  { label: 'B4', zone: 'bar', seats: 3, deposit: rub(8000), x: 0.74, y: 0.74, w: 0.2, h: 0.1 },
];

const BAR = [
  { name: 'Негрони', description: 'Джин, кампари, красный вермут', price: rub(890), category: 'cocktails', volume: '90 мл', popular: true, qty: 40, unit: 'шт', low: 12 },
  { name: 'Эспрессо Мартини', description: 'Водка, кофейный ликёр, эспрессо', price: rub(950), category: 'cocktails', volume: '120 мл', popular: true, qty: 40, unit: 'шт', low: 12 },
  { name: 'Апероль Шприц', description: 'Апероль, просекко, содовая', price: rub(790), category: 'cocktails', volume: '250 мл', popular: false, qty: 40, unit: 'шт', low: 12 },
  { name: 'Олд Фэшн', description: 'Бурбон, биттер, тростниковый сахар', price: rub(1050), category: 'cocktails', volume: '80 мл', popular: false, qty: 40, unit: 'шт', low: 12 },
  { name: 'Маргарита', description: 'Текила, трипл сек, лайм, соль', price: rub(850), category: 'cocktails', volume: '120 мл', popular: false, qty: 40, unit: 'шт', low: 12 },
  { name: 'Мохито', description: 'Белый ром, мята, лайм, содовая', price: rub(780), category: 'cocktails', volume: '300 мл', popular: false, qty: 0, unit: 'шт', low: 12, available: false },
  { name: 'Б-52', description: 'Кофейный ликёр, бейлиз, трипл сек', price: rub(450), category: 'shots', volume: '40 мл', popular: false, qty: 40, unit: 'шт', low: 12 },
  { name: 'Текила', description: 'Серебряная, с лаймом и солью', price: rub(400), category: 'shots', volume: '40 мл', popular: false, qty: 40, unit: 'шт', low: 12 },
  { name: 'Егермейстер', description: 'Ледяной, из морозильника', price: rub(420), category: 'shots', volume: '40 мл', popular: true, qty: 40, unit: 'шт', low: 12 },
  { name: 'Сет из 6 шотов', description: 'Ассорти на компанию', price: rub(2200), category: 'shots', volume: '6 × 40 мл', popular: false, qty: 20, unit: 'шт', low: 5 },
  { name: 'Просекко', description: 'Бутылка, Италия, брют', price: rub(4500), category: 'champagne', volume: '0,75 л', popular: false, qty: 8, unit: 'бут', low: 3 },
  { name: 'Moët & Chandon', description: 'Бутылка, Imperial Brut', price: rub(14900), category: 'champagne', volume: '0,75 л', popular: true, qty: 8, unit: 'бут', low: 3 },
  { name: 'Dom Pérignon', description: 'Бутылка, винтаж, подача с бенгальскими огнями', price: rub(49000), category: 'champagne', volume: '0,75 л', popular: false, qty: 2, unit: 'бут', low: 3 },
  { name: 'Jameson', description: 'Бутылка, ирландский виски', price: rub(9800), category: 'strong', volume: '0,7 л', popular: false, qty: 12, unit: 'бут', low: 3 },
  { name: 'Beluga', description: 'Бутылка, водка, в комплекте морсы', price: rub(8900), category: 'strong', volume: '0,7 л', popular: false, qty: 12, unit: 'бут', low: 3 },
  { name: 'Bacardi Carta Blanca', description: 'Бутылка, белый ром, кола и лайм', price: rub(7500), category: 'strong', volume: '0,7 л', popular: false, qty: 12, unit: 'бут', low: 3 },
  { name: 'Вода', description: 'Негазированная, охлаждённая', price: rub(250), category: 'soft', volume: '0,5 л', popular: false, qty: 90, unit: 'шт', low: 12 },
  { name: 'Red Bull', description: 'Классический', price: rub(450), category: 'soft', volume: '250 мл', popular: false, qty: 90, unit: 'шт', low: 12 },
  { name: 'Свежевыжатый сок', description: 'Апельсин, грейпфрут или яблоко', price: rub(550), category: 'soft', volume: '300 мл', popular: false, qty: 90, unit: 'шт', low: 12 },
];

async function main() {
  // Идемпотентно: повторный запуск не плодит дубли. Заказы и пользователей
  // не трогаем — снести чужие покупки при пересеве было бы неприятно.
  const existing = await db.event.count();
  if (existing > 0) {
    console.log('Каталог уже наполнен, пропускаю. Для пересева: npx prisma migrate reset');
    return;
  }

  for (const e of EVENTS) {
    await db.event.create({
      data: {
        title: e.title,
        subtitle: e.subtitle,
        startsAt: e.startsAt,
        genre: e.genre,
        ageLimit: e.ageLimit,
        lineup: e.lineup,
        description: e.description,
        coverFrom: e.cover[0],
        coverTo: e.cover[1],
        status: 'published',
        ticketTypes: {
          createMany: {
            data: e.tickets.map((t) => ({
              name: t.name,
              description: t.description,
              priceKopecks: t.price,
              quantity: t.quantity,
            })),
          },
        },
      },
    });
  }

  for (const t of TABLES) {
    await db.clubTable.create({
      data: {
        label: t.label,
        zone: t.zone as TableZone,
        seats: t.seats,
        depositKopecks: t.deposit,
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
      },
    });
  }

  for (const b of BAR) {
    await db.barItem.create({
      data: {
        name: b.name,
        description: b.description,
        priceKopecks: b.price,
        category: b.category as BarCategory,
        volume: b.volume,
        popular: b.popular,
        available: b.available ?? true,
        stock: { create: { qty: b.qty, unit: b.unit, lowThreshold: b.low } },
      },
    });
  }

  console.log(`Готово: ${EVENTS.length} событий, ${TABLES.length} столов, ${BAR.length} позиций бара`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
