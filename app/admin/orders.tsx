import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, SectionHeader, Segmented, Sheet, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import type { Order } from '@/src/services';
import { useOrdersStore } from '@/src/store/orders';
import { colors, spacing } from '@/src/theme';

type Filter = 'all' | 'paid' | 'used';

export default function AdminOrders() {
  const orders = useOrdersStore((s) => s.orders);
  const markUsed = useOrdersStore((s) => s.markUsed);

  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Order | null>(null);

  const revenue = orders.reduce((sum, o) => sum + o.total, 0);
  const guests = orders.reduce(
    (sum, o) => sum + o.lines.filter((l) => l.kind === 'ticket').reduce((n, l) => n + l.qty, 0),
    0,
  );

  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  const handleMarkUsed = (order: Order) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markUsed(order.id);
    setSelected(null);
  };

  return (
    <Screen scroll>
      <AdminHeader title="Заказы гостей" subtitle={`${orders.length} за всё время`} />

      <View style={styles.metrics}>
        <Metric value={formatPrice(revenue)} label="Выручка" />
        <Metric value={String(guests)} label="Билетов" />
      </View>

      <View style={styles.filter}>
        <Segmented
          options={[
            { value: 'all', label: 'Все' },
            { value: 'paid', label: 'Оплачены' },
            { value: 'used', label: 'Прошли' },
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
                    {order.id} · {format(new Date(order.createdAt), 'd MMM, HH:mm', { locale: ru })}
                  </Text>
                </View>
                <Badge
                  label={order.status === 'used' ? 'Прошёл' : 'Оплачен'}
                  tone={order.status === 'used' ? 'neutral' : 'success'}
                />
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
                    × {line.qty}
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

            {selected.status === 'paid' ? (
              <Button
                label="Отметить как прошедший"
                size="lg"
                fullWidth
                onPress={() => handleMarkUsed(selected)}
              />
            ) : (
              <Text variant="caption" tone="faint" style={styles.usedNote}>
                Билет уже отмечен на входе
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
