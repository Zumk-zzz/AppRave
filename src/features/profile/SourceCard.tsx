import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, SectionHeader, Text } from '@/src/components';
import { API_URL, getDataSource, ping } from '@/src/services';
import { colors, spacing } from '@/src/theme';

type Reachable = 'unknown' | 'yes' | 'no';

/**
 * Откуда приложение берёт данные и отвечает ли сервер.
 *
 * Нужно, чтобы «афиша пустая» не превращалась в гадание: сразу видно,
 * идут ли данные с сервера и доступен ли он вообще. На телефоне в чужой
 * сети это первое, что стоит проверить.
 */
export function SourceCard() {
  const source = getDataSource();
  const [reachable, setReachable] = useState<Reachable>('unknown');

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      void (async () => {
        const ok = await ping();
        if (alive) setReachable(ok ? 'yes' : 'no');
      })();

      return () => {
        alive = false;
      };
    }, []),
  );

  const usingApi = source === 'api';

  return (
    <>
      <SectionHeader title="Источник данных" kicker="Разработка" />

      <Card style={styles.card}>
        <View style={styles.row}>
          <Ionicons
            name={usingApi ? 'cloud-outline' : 'phone-portrait-outline'}
            size={20}
            color={usingApi ? colors.accent : colors.textMuted}
          />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{usingApi ? 'Сервер' : 'Локальные данные'}</Text>
            <Text variant="caption" tone="faint">
              {usingApi
                ? 'Афиша, меню и столы приходят с бэкенда'
                : 'Приложение работает автономно, сервер не нужен'}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Ionicons
            name={reachable === 'yes' ? 'checkmark-circle' : reachable === 'no' ? 'close-circle' : 'ellipse-outline'}
            size={20}
            color={
              reachable === 'yes' ? colors.success : reachable === 'no' ? colors.danger : colors.textFaint
            }
          />
          <View style={styles.flex}>
            <Text variant="body">
              {reachable === 'yes' ? 'Сервер отвечает' : reachable === 'no' ? 'Сервер не отвечает' : 'Проверяем…'}
            </Text>
            <Text variant="caption" tone="faint">
              {API_URL}
            </Text>
          </View>
          {reachable === 'no' && usingApi && <Badge label="Нет связи" tone="danger" />}
        </View>

        <Text variant="caption" tone="faint">
          Переключается в app.json, поле extra.dataSource. Требует перезапуска.
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
});
