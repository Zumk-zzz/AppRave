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

/** Сколько баллов нужно набрать, чтобы получить уровень. */
export const TIER_THRESHOLD: Record<LoyaltyTier, number> = {
  silver: 0,
  gold: 1000,
  black: 5000,
};

export const TIER_ORDER: LoyaltyTier[] = ['silver', 'gold', 'black'];

/** Доля от суммы заказа, которая возвращается баллами. */
export const POINTS_RATE = 0.05;

/** Баллы за покупку: 5% от суммы, округляя вниз. */
export function pointsForPurchase(total: number): number {
  return Math.floor(total * POINTS_RATE);
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
