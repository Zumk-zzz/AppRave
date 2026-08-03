import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';
import { Text } from './Text';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  label?: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Прокручивать горизонтально, если вариантов много */
  scrollable?: boolean;
}

/** Выбор одного значения из нескольких: жанр, категория, тип движения. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  scrollable = false,
}: SegmentedProps<T>) {
  const items = options.map((option) => {
    const selected = option.value === value;

    return (
      <Pressable
        key={option.value}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => {
          Haptics.selectionAsync();
          onChange(option.value);
        }}
        style={[styles.item, scrollable && styles.itemAuto, selected && styles.itemSelected]}
      >
        <Text style={[styles.itemLabel, selected && styles.itemLabelSelected]} numberOfLines={1}>
          {option.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View style={styles.root}>
      {label && (
        <Text variant="label" tone="faint">
          {label}
        </Text>
      )}

      {scrollable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollTrack}
        >
          {items}
        </ScrollView>
      ) : (
        <View style={styles.track}>{items}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 3,
  },
  scrollTrack: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  item: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  itemAuto: {
    flex: 0,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
  },
  itemSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  itemLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  itemLabelSelected: {
    color: colors.onAccent,
  },
});
