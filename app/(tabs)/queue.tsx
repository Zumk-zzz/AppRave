import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Screen, Text } from '@/src/components';
import { nearestEvent } from '@/src/lib/events';
import { formatEventDate, pluralWithCount } from '@/src/lib/format';
import { eventsService, type ClubEvent } from '@/src/services';
import { redeemableOf, useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

/**
 * Очередь бара: оплаченные предзаказы, которые ещё не выданы.
 *
 * Нужна, чтобы бармен готовил заранее, а не начинал искать бутылку,
 * когда гость уже стоит у стойки.
 */
export default function QueueTab() {
  const orders = useOrdersStore((s) => s.staffOrders);
  const loadStaff = useOrdersStore((s) => s.loadStaff);

  const [event, setEvent] = useState<ClubEvent | null>(null);
  const eventId = event?.id ?? null;

  // Вечеринка определяется сама: бармен готовит напитки для той ночи,
  // которая идёт, и выбирать её из списка незачем
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setEvent(nearestEvent(await eventsService.list()));
      })();
    }, []),
  );

  // Очередь перечитывается при каждом возвращении на вкладку: гость мог
  // доплатить напиток, пока бармен смотрел в другой экран
  useFocusEffect(
    useCallback(() => {
      if (eventId) void loadStaff(eventId);
    }, [eventId, loadStaff]),
  );

  const pending = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'cancelled' && o.eventId === eventId)
      .map((order) => ({
        order,
        items: order.lines.filter((line) => line.kind === 'bar' && redeemableOf(line) > 0),
        table: order.lines.find((l) => l.kind === 'table'),
      }))
      .filter((x) => x.items.length > 0);
  }, [orders, eventId]);

  const totalDrinks = pending.reduce(
    (n, x) => n + x.items.reduce((m, line) => m + redeemableOf(line), 0),
    0,
  );

  const eventTitle = event?.title;

  return (
    <Screen scroll padded={false}>
      <View style={styles.header}>
        <Text variant="label" tone="accent">
          Готовить заранее
        </Text>
        <Text variant="display">Очередь</Text>
        <Text variant="body" tone="muted" style={styles.lead}>
          {totalDrinks > 0
            ? `${pluralWithCount(totalDrinks, 'напиток', 'напитка', 'напитков')} ждут выдачи`
            : 'Невыданных предзаказов нет'}
        </Text>
      </View>

      <View style={styles.header}>
        <Text variant="caption" tone={event ? 'muted' : 'danger'}>
          {event
            ? `Смена: ${event.title} · ${formatEventDate(new Date(event.date))}`
            : 'Ближайшей вечеринки нет'}
        </Text>
      </View>

      <View style={styles.list}>
        {pending.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done" size={36} color={colors.textFaint} />
            <Text variant="body" tone="muted" style={styles.center}>
              {eventTitle ? `По вечеринке ${eventTitle} всё выдано` : 'Выдавать нечего'}
            </Text>
          </View>
        ) : (
          pending.map(({ order, items, table }) => (
            <Card key={order.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{order.number}</Text>
                  {order.guest && (
                    <Text variant="caption" tone="muted">
                      {order.guest.name}
                    </Text>
                  )}
                  {table && (
                    <Text variant="caption" tone="accent">
                      {table.title}
                    </Text>
                  )}
                </View>
                <Badge
                  label={pluralWithCount(
                    items.reduce((n, line) => n + redeemableOf(line), 0),
                    'позиция',
                    'позиции',
                    'позиций',
                  )}
                  tone="accent"
                />
              </View>

              <View style={styles.items}>
                {items.map((line) => (
                  <View key={line.id} style={styles.itemRow}>
                    <Text variant="body" style={styles.flex} numberOfLines={1}>
                      {line.title}
                    </Text>
                    <View style={styles.qtyPill}>
                      <Text variant="caption" tone="accent">
                        {redeemableOf(line)}
                        {line.redeemed > 0 ? ` из ${line.qty}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <Text variant="caption" tone="faint">
                Выдать можно на вкладке «Сканер», отсканировав код гостя
              </Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  lead: {
    marginTop: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    gap: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  items: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  qtyPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxxl,
  },
  center: {
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
});
