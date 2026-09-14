import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components';
import { ensurePermission, REMIND_HOURS_BEFORE } from '@/src/lib/reminders';
import { colors, spacing } from '@/src/theme';

type State = 'unknown' | 'granted' | 'denied' | 'blocked';

/**
 * Управление напоминаниями.
 *
 * Отдельный компонент, потому что состояние живёт в системных настройках,
 * а не в приложении: пользователь может отозвать разрешение в любой момент,
 * и строку нужно перечитывать при каждом появлении экрана.
 */
export function NotificationsRow() {
  const [state, setState] = useState<State>('unknown');

  const refresh = useCallback(async () => {
    const current = await Notifications.getPermissionsAsync();
    setState(current.granted ? 'granted' : current.canAskAgain ? 'denied' : 'blocked');
  }, []);

  // Перечитываем при каждом показе экрана: разрешение могли отозвать
  // в настройках iOS, пока приложение было свёрнуто.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const handlePress = async () => {
    if (state === 'granted') return;

    if (state === 'blocked') {
      // Спрашивать повторно бесполезно — система больше не покажет диалог
      void Linking.openSettings();
      return;
    }

    const granted = await ensurePermission();
    setState(granted ? 'granted' : 'blocked');
  };

  const hint =
    state === 'granted'
      ? `Напомним за ${REMIND_HOURS_BEFORE} часа до вечеринки`
      : state === 'blocked'
        ? 'Отключены — включить можно в настройках iOS'
        : 'Выключены. Нажмите, чтобы включить';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Ionicons
        name={state === 'granted' ? 'notifications' : 'notifications-off-outline'}
        size={20}
        color={state === 'granted' ? colors.accent : colors.textMuted}
      />

      <View style={styles.texts}>
        <Text variant="body">Напоминания</Text>
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      </View>

      {state !== 'granted' && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
});
