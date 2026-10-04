import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, Text } from '@/src/components';
import { staffService, type StaffAction } from '@/src/services';
import { useAuthStore, useCan } from '@/src/store/auth';
import { colors, spacing } from '@/src/theme';

export default function HistoryScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const seesAll = useCan('orders:read');
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId : undefined;
  const [items, setItems] = useState<StaffAction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);

  const load = useCallback(async (next?: string) => {
    if (pending.current || !user?.id || !user.staffRole) return;
    pending.current = true;
    const request = generation.current;
    setBusy(true);
    setError(null);
    try {
      const page = await staffService.history(next, orderId);
      if (request !== generation.current) return;
      setItems((prev) => next ? [...prev, ...page.items.filter((row) => !prev.some((p) => p.id === row.id))] : page.items);
      setCursor(page.nextCursor);
    } catch (e) {
      if (request === generation.current) setError(e instanceof Error ? e.message : 'Не удалось загрузить историю');
    } finally {
      if (request === generation.current) { pending.current = false; setBusy(false); }
    }
  }, [user?.id, user?.staffRole, orderId]);

  useFocusEffect(useCallback(() => {
    generation.current++;
    pending.current = false;
    setItems([]);
    setCursor(null);
    void load();
    return () => { generation.current++; pending.current = false; };
  }, [load]));

  return <Screen scroll>
    <View style={styles.content}>
      <Button label="Назад" variant="surface" onPress={() => router.back()} />
      <Text variant="title">История выполнения</Text>
      {!user?.staffRole ? <Text variant="body">Раздел доступен сотрудникам.</Text> : <>
        <Text variant="body" tone="muted">
          {seesAll ? 'Проходы и выдачи всей команды' : 'Ваши подтверждённые проходы и выдачи'}
          {orderId ? ' по этому заказу' : '. Все смены'}
        </Text>
        <Button label={busy ? 'Загрузка…' : 'Обновить'} variant="outline" disabled={busy} onPress={() => void load()} />
        {error && <Text variant="body" tone="danger">{error}</Text>}
        {!busy && !error && items.length === 0 && <Text variant="body" tone="muted">Подтверждений пока нет.</Text>}
        {items.map((item) => <Card key={item.id} style={styles.card}>
          <View style={styles.heading}>
            <Text variant="bodyStrong" style={styles.flex}>{item.orderNumber ?? 'Заказ'}</Text>
            <Badge label={item.kind === 'bar_issued' ? 'Выдано' : item.kind === 'bar_started' ? 'Готовится' : item.kind === 'bar_ready' ? 'Готово' : 'Вход'} tone="success" />
          </View>
          <Text variant="body">{item.summary ?? 'Подтверждение выполнено'}</Text>
          <Text variant="bodyStrong">Выполнил: {item.actorName}</Text>
          <Text variant="caption" tone="muted">{new Date(item.createdAt).toLocaleString('ru-RU')}</Text>
        </Card>)}
        {cursor && <Button label="Показать ещё" variant="surface" disabled={busy} onPress={() => void load(cursor)} />}
      </>}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxl },
  card: { gap: spacing.sm, borderColor: colors.border },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
