import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Счётчик справа: «Коктейли 12» */
  count?: number;
}

/** Пилюля-фильтр. Выбранная заливается лаймом. */
export function Chip({ label, selected = false, onPress, count }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      {count !== undefined && (
        <View style={[styles.count, selected && styles.countSelected]}>
          <Text style={[styles.countText, selected && styles.countTextSelected]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Горизонтальный ряд чипов с прокруткой, вылезающий за края экрана. */
export function ChipRow({
  children,
  paddingHorizontal = spacing.lg,
}: {
  children: React.ReactNode;
  paddingHorizontal?: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal }]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipPressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  labelSelected: {
    color: colors.onAccent,
  },
  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
  },
  countSelected: {
    backgroundColor: 'rgba(10,10,11,0.15)',
  },
  countText: {
    fontFamily: fonts.bodySemi,
    fontSize: fontSize.xs,
    lineHeight: 20,
    color: colors.textMuted,
  },
  countTextSelected: {
    color: colors.onAccent,
  },
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
