import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';
import { Text } from './Text';

export type BadgeTone = 'accent' | 'neutral' | 'danger' | 'success' | 'gold' | 'purple';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

const toneStyles: Record<BadgeTone, { bg: string; fg: string }> = {
  accent: { bg: colors.accent, fg: colors.onAccent },
  neutral: { bg: colors.surfaceElevated, fg: colors.textMuted },
  danger: { bg: 'rgba(255,77,77,0.16)', fg: colors.danger },
  success: { bg: 'rgba(74,222,128,0.16)', fg: colors.success },
  gold: { bg: 'rgba(232,185,35,0.16)', fg: colors.tierGold },
  purple: { bg: 'rgba(139,92,246,0.18)', fg: colors.tierBlack },
};

/** Мелкая метка: «VIP», «Осталось 5», «Оплачено». */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const { bg, fg } = toneStyles[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: fontSize.xs,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
});
