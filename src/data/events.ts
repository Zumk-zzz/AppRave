import type { ClubEvent } from '@/src/services/types';

/** Ближайшая дата через N дней в указанное время. */
function nightAfter(days: number, hour = 23): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/**
 * Мок-афиша. Даты считаются от текущего дня, поэтому лента всегда
 * выглядит живой, в какой бы день ни открыли приложение.
 */
export const MOCK_EVENTS: ClubEvent[] = [
  {
    id: 'ev_neon_ritual',
    title: 'NEON RITUAL',
    subtitle: 'Резиденты клуба',
    date: nightAfter(1),
    genre: 'techno',
    ageLimit: 18,
    lineup: ['KIRA VOID', 'DEEP/SHIFT', 'ANNA GRAY'],
    description:
      'Главная техно-ночь недели. Три резидента, дым до потолка и саунд-система, ради которой сюда и приходят. Танцпол открыт до последнего гостя.',
    cover: ['#FF2E93', '#7A1350'],
    tickets: [
      {
        id: 'tt_standard',
        name: 'Standard',
        description: 'Вход до 01:00',
        price: 1500,
        available: 42,
      },
      {
        id: 'tt_fasttrack',
        name: 'Fast Track',
        description: 'Без очереди, любое время',
        price: 2500,
        available: 12,
      },
      {
        id: 'tt_vip',
        name: 'VIP',
        description: 'Отдельный вход, гардероб и welcome-шот',
        price: 4500,
        available: 6,
      },
    ],
  },
  {
    id: 'ev_afterglow',
    title: 'AFTERGLOW',
    subtitle: 'House all night',
    date: nightAfter(3),
    genre: 'house',
    ageLimit: 18,
    lineup: ['SOLARIS', 'MIKA DUB'],
    description:
      'Мягкий хаус, тёплый свет и много воздуха. Вечер для тех, кто хочет танцевать, но и слышать собеседника.',
    cover: ['#00E5FF', '#0A3D52'],
    tickets: [
      { id: 'tt_standard', name: 'Standard', description: 'Вход до 02:00', price: 1200, available: 88 },
      {
        id: 'tt_vip',
        name: 'VIP',
        description: 'Отдельный вход и гардероб',
        price: 3500,
        available: 10,
      },
    ],
  },
  {
    id: 'ev_low_end',
    title: 'LOW END',
    subtitle: 'Hip-hop & RnB',
    date: nightAfter(5),
    genre: 'hiphop',
    ageLimit: 18,
    lineup: ['DJ SEVEN', 'MC RAVA', 'BOOM CLAP'],
    description:
      'Классика и свежие релизы, живой MC и баттл-сет в середине ночи. Приходите компанией.',
    cover: ['#FF5C00', '#5A1E00'],
    tickets: [
      { id: 'tt_standard', name: 'Standard', description: 'Вход до 01:30', price: 1000, available: 120 },
      {
        id: 'tt_fasttrack',
        name: 'Fast Track',
        description: 'Без очереди',
        price: 1800,
        available: 25,
      },
    ],
  },
  {
    id: 'ev_mirrorball',
    title: 'MIRRORBALL',
    subtitle: 'Disco revival',
    date: nightAfter(8),
    genre: 'disco',
    ageLimit: 21,
    lineup: ['VELVET SUN', 'DISCO PATROL'],
    description:
      'Зеркальный шар, костюмы семидесятых и только пластинки. Дресс-код обязателен — блеск приветствуется.',
    cover: ['#E8B923', '#5A4300'],
    tickets: [
      { id: 'tt_standard', name: 'Standard', description: 'Вход до 01:00', price: 1400, available: 60 },
      {
        id: 'tt_vip',
        name: 'VIP',
        description: 'Столик у танцпола не входит, только вход',
        price: 3900,
        available: 8,
      },
    ],
  },
  {
    id: 'ev_blackout',
    title: 'BLACKOUT',
    subtitle: 'Hard techno · 12 часов',
    date: nightAfter(12),
    genre: 'techno',
    ageLimit: 21,
    lineup: ['NULL POINTER', 'KIRA VOID', 'HEXA', 'STROBE'],
    description:
      'Двенадцать часов без остановки, четыре сцены и полная темнота с одним стробоскопом. Не для новичков.',
    cover: ['#8B5CF6', '#2B1857'],
    tickets: [
      { id: 'tt_standard', name: 'Standard', description: 'Вход до 03:00', price: 2200, available: 30 },
      {
        id: 'tt_fasttrack',
        name: 'Fast Track',
        description: 'Без очереди, любое время',
        price: 3400,
        available: 4,
      },
      {
        id: 'tt_vip',
        name: 'VIP',
        description: 'Все сцены, лаунж и отдельный бар',
        price: 6900,
        available: 0,
      },
    ],
  },
];
