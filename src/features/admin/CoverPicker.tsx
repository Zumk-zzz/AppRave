import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components';
import { COVER_PRESETS } from '@/src/data/covers';
import { colors, radius, spacing } from '@/src/theme';

export function CoverPicker({
  value,
  onChange,
}: {
  value: readonly [string, string];
  onChange: (next: readonly [string, string]) => void;
}) {
  return (
    <View style={styles.root}>
      <Text variant="label" tone="faint">
        Обложка
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {COVER_PRESETS.map((preset) => {
          const selected = preset.colors[0] === value[0];

          return (
            <Pressable
              key={preset.id}
              accessibilityRole="button"
              accessibilityLabel={preset.label}
              accessibilityState={{ selected }}
              onPress={() => {
                Haptics.selectionAsync();
                onChange(preset.colors);
              }}
              style={[styles.swatch, selected && styles.swatchSelected]}
            >
              <LinearGradient
                colors={preset.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.md,
    paddingVertical: 2,
  },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
  },
  swatchSelected: {
    borderColor: colors.accent,
  },
});
