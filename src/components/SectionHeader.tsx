import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { spacing } from '@/src/theme';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** Мелкая подпись над заголовком */
  kicker?: string;
  /** Действие справа: «Все», «Изменить» */
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, kicker, actionLabel, onActionPress }: SectionHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.titles}>
        {kicker && (
          <Text variant="label" tone="accent" style={styles.kicker}>
            {kicker}
          </Text>
        )}
        <Text variant="title">{title}</Text>
      </View>

      {actionLabel && (
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            Haptics.selectionAsync();
            onActionPress?.();
          }}
        >
          <Text variant="caption" tone="accent">
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  titles: {
    flex: 1,
    gap: spacing.xs,
  },
  kicker: {
    marginBottom: 2,
  },
});
