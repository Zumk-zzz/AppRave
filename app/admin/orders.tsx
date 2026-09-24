import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, SectionHeader, Segmented, Sheet, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { ORDER_STATUS_TONE } from '@/src/lib/order-actions';
import type { Order } from '@/src/services';
import { useOrdersStore } from '@/src/store/orders';
import { colors, spacing } from '@/src/theme';

type Filter = 'all' | 'paid' | 'used' | 'cancelled';

/** В сводке продаж заказ «прошёл», а не «использован»: речь о гостях. */
const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Не оплачен',
  paid: 'Оплачен',
  used: 'Прошёл',
  cancelled: 'Отменён',
  expired: 'Резерв сгорел',
  refunded: 'Возврат',
};

export default function AdminOrders() {
  const orders = useOrdersStore((s) => s.staffOrders);
  const loadStaff = useOrdersStore((s) => s.loadStaff);
  const admit = useOrdersStore((s) => s.admit);

  // Без аргумента — продажи по всем вечеринкам: администратор смотрит
  // сводку целиком, а не одну ночь
  useFocusEffect(
    useCallback(() => {
      void loadStaff();
    }, [loadStaff]),
  );

  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Order | null>(null);

  // Отменённые и возвращённые в выручку не идут: деньги вернулись гостю,
  // и завышенная цифра тут хуже, чем отсутствие цифры вообще.
  const returned = (o: Order) => o.status === 'cancelled' || o.status === 'refunded';
  const active = orders.filter((o) => !returned(o));
  const revenue = active.reduce((sum, o) => sum + o.total, 0);
  const guests = active.reduce(
    (sum, o) => sum + o.lines.filter((l) => l.kind === 'ticket').reduce((n, l) => n + l.qty, 0),
    0,
  );
  const refunded = orders.filter(returned).reduce((sum, o) => sum + o.total, 0);

  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  const handleMarkUsed = (order: Order) => {
    void (async () => {
      try {
        await admit(order);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelected(null);
      } catch (e) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
      }
    })();
  };

  return (
    <Screen scroll>
      <AdminHeader title="Заказы гостей" subtitle={`${orders.length} за всё время`} />

      <View style={styles.metrics}>
        <Metric value={formatPrice(revenue)} label="Выручка" />
        <Metric value={String(guests)} label="Билетов" />
      </View>

      {refunded > 0 && (
        <Text variant="caption" tone="faint" style={styles.refunded}>
          Возвращено гостям: {formatPrice(refunded)}
        </Text>
      )}

      <View style={styles.filter}>
        <Segmented
          options={[
            { value: 'all', label: 'Все' },
            { value: 'paid', label: 'Оплачены' },
            { value: 'used', label: 'Прошли' },
            { value: 'cancelled', label: 'Отменены' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>

      <SectionHeader title="Продажи" kicker="Новые сверху" />

      {visible.length === 0 ? (
        <Text variant="body" tone="muted" style={styles.empty}>
          {orders.length === 0 ? 'Продаж пока не было' : 'В этой категории пусто'}
        </Text>
      ) : (
        <View style={styles.list}>
          {visible.map((order) => (
            <Card key={order.id} onPress={() => setSelected(order)} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {order.eventTitle ?? 'Заказ'}
                  </Text>
                  <Text variant="caption" tone="faint">
                    {order.number} ·{' '}
                    {format(new Date(order.createdAt), 'd MMM, HH:mm', { locale: ru })}
                  </Text>
                </View>
                <Badge label={STATUS_LABEL[order.status]} tone={ORDER_STATUS_TONE[order.status]} />
              </View>

              <View style={styles.cardFoot}>
                <Text variant="caption" tone="muted">
                  {pluralWithCount(
                    order.lines.reduce((n, l) => n + l.qty, 0),
                    'позиция',
                    'позиции',
                    'позиций',
                  )}
                </Text>
                <Text variant="bodyStrong">{formatPrice(order.total)}</Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      <Sheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.id ?? ''}
      >
        {selected && (
          <View style={styles.sheet}>
            <Text variant="body" tone="muted">
              {selected.eventTitle}
              {selected.eventDate ? ` · ${formatEventDate(new Date(selected.eventDate))}` : ''}
            </Text>

            <View style={styles.lines}>
              {selected.lines.map((line, i) => (
                <View key={i} style={styles.lineRow}>
                  <Text variant="body" style={styles.flex} numberOfLines={1}>
                    {line.title}
                  </Text>
                  <Text variant="caption" tone="faint">
                    {line.kind === 'table'
                      ? '1'
                      : line.redeemed > 0
                        ? `${line.redeemed}/${line.qty} выдано`
                        : `× ${line.qty}`}
                  </Text>
                  <Text variant="body">{formatPrice(line.price * line.qty)}</Text>
                </View>
              ))}
            </View>

            {selected.lines.some((l) => l.guests && l.guests.length > 0) && (
              <View>
                <Text variant="label" tone="faint">
                  Гостевой список
                </Text>
                {selected.lines
                  .flatMap((l) => l.guests ?? [])
                  .map((guest) => (
                    <Text key={guest} variant="body" tone="muted">
                      {guest}
                    </Text>
                  ))}
              </View>
            )}

            <View style={styles.total}>
              <Text variant="bodyStrong">Итого</Text>
              <Text variant="title">{formatPrice(selected.total)}</Text>
            </View>

            {selected.status === 'paid' && selected.lines.some((l) => l.kind === 'ticket') ? (
              <Button
                label="Отметить проход"
                size="lg"
                fullWidth
                onPress={() => handleMarkUsed(selected)}
              />
            ) : (
              <Text variant="caption" tone="faint" style={styles.usedNote}>
                {selected.status === 'cancelled'
                  ? 'Заказ отменён, деньги возвращены'
                  : selected.lines.some((l) => l.kind === 'ticket')
                    ? 'Проход уже отмечен'
                    : 'В заказе нет билетов — только бар или стол'}
              </Text>
            )}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.metric}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  metric: {
    flex: 1,
    gap: spacing.xs,
  },
  filter: {
    marginBottom: spacing.xl,
  },
  refunded: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  sheet: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  lines: {
    gap: spacing.sm,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  usedNote: {
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
});
