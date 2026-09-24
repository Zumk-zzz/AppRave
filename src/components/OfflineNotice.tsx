import { Ionicons } from '@expo/vector-icons';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { isOffline, watchConnection } from '@/src/services';
import { colors, radius, spacing } from '@/src/theme';
import { Text } from './Text';

/**
 * Есть ли сейчас связь с сервером.
 *
 * Отдельного опроса не делаем: ответ уже известен из последнего запроса,
 * а лишний пинг раз в секунду в клубе с плохой сетью только добавил бы
 * шума. Значение меняется само, когда очередной запрос проходит или нет.
 */
export function useOffline(): boolean {
  return useSyncExternalStore(
    watchConnection,
    isOffline,
    // На сервере рендера нет, но React требует значение по умолчанию
    () => false,
  );
}

/**
 * Плашка «нет связи».
 *
 * Показывается там, где гость видит сохранённое: без неё пустой или
 * устаревший экран выглядит как потерянные билеты, и человек начинает
 * искать поломку в приложении вместо того, чтобы выйти на воздух.
 */
export function OfflineNotice({ hint }: { hint?: string }) {
  const offline = useOffline();
  if (!offline) return null;

  return (
    <View style={styles.root}>
      <Ionicons name="cloud-offline-outline" size={18} color={colors.textMuted} />
      <View style={styles.text}>
        <Text variant="caption">Нет связи</Text>
        <Text variant="caption" tone="faint">
          {hint ?? 'Показываем то, что сохранено на телефоне'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
