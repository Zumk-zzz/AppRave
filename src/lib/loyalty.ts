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
