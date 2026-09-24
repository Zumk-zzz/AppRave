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
  /**
   * Отступ сверху: нужен, когда заголовок идёт следом за карточкой.
   *
   * Без него новая секция прилипает к предыдущей, и подпись читается
   * как часть того, что над ней. Первому заголовку на экране отступ
   * не нужен — там уже есть поле страницы.
   */
  spaced?: boolean;
}

export function SectionHeader({
  title,
  kicker,
  actionLabel,
  onActionPress,
  spaced,
}: SectionHeaderProps) {
  return (
    <View style={[styles.root, spaced && styles.spaced]}>
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
  spaced: {
    marginTop: spacing.xxl,
  },
  titles: {
    flex: 1,
    gap: spacing.xs,
  },
  kicker: {
    // Подпись набрана мелким шрифтом в верхнем регистре: без этого
    // зазора она читается как первая строка заголовка
    marginBottom: spacing.xs,
  },
});
