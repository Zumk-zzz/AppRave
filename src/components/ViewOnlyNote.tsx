import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/src/theme';
import { Text } from './Text';

/**
 * Плашка «только просмотр» для администратора на гостевых экранах.
 *
 * Экраны ему нужны — проверить, как выглядит афиша или меню после
 * правок. А вот покупки нет: администратор не гость. Плашка объясняет,
 * почему кнопки нет, иначе отсутствие кнопки читается как поломка.
 */
export function ViewOnlyNote({ text }: { text: string }) {
  return (
    <View style={styles.root}>
      <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
      <Text variant="caption" tone="muted" style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  text: {
    flex: 1,
  },
});
