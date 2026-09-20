import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Chip, ChipRow, Screen, Text } from '@/src/components';
import { pluralWithCount } from '@/src/lib/format';
import { eventsService, type ClubEvent } from '@/src/services';
import { useCatalogStore } from '@/src/store/catalog';
import { redeemableOf, useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

/**
 * Очередь бара: оплаченные предзаказы, которые ещё не выданы.
 *
 * Нужна, чтобы бармен готовил заранее, а не начинал искать бутылку,
 * когда гость уже стоит у стойки.
 */
export default function QueueTab() {
  const orders = useOrdersStore((s) => s.orders);
  const catalogEvents = useCatalogStore((s) => s.events);

  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const list = await eventsService.list();
        setEvents(list);
        setEventId((current) => current ?? list[0]?.id ?? null);
      })();
    }, []),
  );

  const pending = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'cancelled' && o.eventId === eventId)
      .map((order) => ({
        order,
        items: order.lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => line.kind === 'bar' && redeemableOf(line) > 0),
        table: order.lines.find((l) => l.kind === 'table'),
      }))
      .filter((x) => x.items.length > 0);
  }, [orders, eventId]);

  const totalDrinks = pending.reduce(
    (n, x) => n + x.items.reduce((m, i) => m + redeemableOf(i.line), 0),
    0,
  );

  const eventTitle = catalogEvents.find((e) => e.id === eventId)?.title;

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

      <ChipRow>
        {events.map((e) => (
          <Chip
            key={e.id}
            label={e.title}
            selected={e.id === eventId}
            onPress={() => setEventId(e.id)}
          />
        ))}
      </ChipRow>

      <View style={styles.list}>
        {pending.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done" size={36} color={colors.textFaint} />
            <Text variant="body" tone="muted" style={styles.center}>
              По вечеринке {eventTitle ?? '—'} всё выдано
            </Text>
          </View>
        ) : (
          pending.map(({ order, items, table }) => (
            <Card key={order.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{order.id}</Text>
                  {table && (
                    <Text variant="caption" tone="accent">
                      {table.title}
                    </Text>
                  )}
                </View>
                <Badge
                  label={pluralWithCount(
                    items.reduce((n, i) => n + redeemableOf(i.line), 0),
                    'позиция',
                    'позиции',
                    'позиций',
                  )}
                  tone="accent"
                />
              </View>

              <View style={styles.items}>
                {items.map(({ line, index }) => (
                  <View key={index} style={styles.itemRow}>
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
