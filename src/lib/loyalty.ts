import type { BadgeTone } from '@/src/components';
import type { LoyaltyTier } from '@/src/services';
import { colors } from '@/src/theme';

export const TIER_LABEL: Record<LoyaltyTier, string> = {
  silver: 'Silver',
  gold: 'Gold',
  black: 'Black',
};

export const TIER_TONE: Record<LoyaltyTier, BadgeTone> = {
  silver: 'neutral',
  gold: 'gold',
  black: 'purple',
};

export const TIER_COLOR: Record<LoyaltyTier, string> = {
  silver: colors.tierSilver,
  gold: colors.tierGold,
  black: colors.tierBlack,
};

/** Заливка карты. Тёмная и приглушённая: карта не должна спорить с акцентом. */
export const TIER_GRADIENT: Record<LoyaltyTier, readonly [string, string]> = {
  silver: ['#3C3C44', '#17171B'],
  gold: ['#6B5210', '#241B06'],
  black: ['#452880', '#170D2B'],
};

/** Сколько баллов нужно набрать, чтобы получить уровень. */
export const TIER_THRESHOLD: Record<LoyaltyTier, number> = {
  silver: 0,
  gold: 1000,
  black: 5000,
};

/** Доля от суммы заказа, которая возвращается баллами. Растёт с уровнем. */
export const TIER_RATE: Record<LoyaltyTier, number> = {
  silver: 0.05,
  gold: 0.07,
  black: 0.1,
};

export const TIER_PERKS: Record<LoyaltyTier, string[]> = {
  silver: ['5% от заказа возвращается баллами', 'Ранний доступ к афише', 'Бронь столика онлайн'],
  gold: [
    '7% от заказа возвращается баллами',
    'Бесплатный гардероб',
    'Приоритет при брони столов',
    'Вход без очереди по будням',
  ],
  black: [
    '10% от заказа возвращается баллами',
    'Персональный менеджер в чате',
    'Welcome-бутылка на VIP-столе',
    'Вход без очереди всегда',
    'Проход +1 бесплатно',
  ],
};

export const TIER_ORDER: LoyaltyTier[] = ['silver', 'gold', 'black'];

/** Баллы за покупку — процент зависит от текущего уровня, округляем вниз. */
export function pointsForPurchase(total: number, tier: LoyaltyTier): number {
  return Math.floor(total * TIER_RATE[tier]);
}

/** Уровень, соответствующий накопленным баллам. */
export function tierForPoints(points: number): LoyaltyTier {
  if (points >= TIER_THRESHOLD.black) return 'black';
  if (points >= TIER_THRESHOLD.gold) return 'gold';
  return 'silver';
}

/** Следующий уровень или null, если достигнут максимальный. */
export function nextTier(tier: LoyaltyTier): LoyaltyTier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}

/** Прогресс к следующему уровню от 0 до 1. На максимальном уровне — 1. */
export function tierProgress(points: number): number {
  const current = tierForPoints(points);
  const next = nextTier(current);
  if (!next) return 1;

  const from = TIER_THRESHOLD[current];
  const to = TIER_THRESHOLD[next];
  return Math.min(1, Math.max(0, (points - from) / (to - from)));
}

/** Сколько баллов не хватает до следующего уровня. */
export function pointsToNextTier(points: number): number {
  const next = nextTier(tierForPoints(points));
  return next ? Math.max(0, TIER_THRESHOLD[next] - points) : 0;
}
