import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Badge, Card, Chip, ChipRow, Screen, Stepper, Text } from '@/src/components';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/src/data/bar';
import { nearestEvent } from '@/src/lib/events';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { barService, eventsService, type BarCategory, type BarItem, type ClubEvent } from '@/src/services';
import { useCan } from '@/src/store/auth';
import { buildLineId, useCartStore } from '@/src/store/cart';
import { colors, spacing } from '@/src/theme';

type Filter = 'all' | BarCategory;

export default function BarTab() {
  const items = useCartStore((s) => s.items);
  const add = useCartStore((s) => s.add);
  const setQty = useCartStore((s) => s.setQty);
  // Персонал не покупает: у него нет права purchase
  const canBuy = useCan('purchase');

  const [events, setEvents] = useState<ClubEvent[] | null>(null);
  const [menu, setMenu] = useState<BarItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  // Перечитываем при фокусе: админ мог добавить позицию или снять её с продажи
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const [list, loadedMenu] = await Promise.all([eventsService.list(), barService.menu()]);
        setEvents(list);
        setMenu(loadedMenu);
      })();
    }, []),
  );

  /**
   * К какой вечеринке относится заказ бара.
   *
   * Раньше её выбирали из списка, хотя почти всегда это ближайшая ночь.
   * Но не всегда: если гость прямо сейчас берёт билет на следующую
   * пятницу, коктейли должны уехать туда же, иначе он придёт за ними
   * не в тот день. Поэтому сначала смотрим, что уже в корзине, и только
   * потом берём ближайшую.
   */
  const event = useMemo(() => {
    if (!events) return null;

    const planned = items.find((i) => i.kind !== 'bar' && i.eventId);
    const fromCart = planned && events.find((e) => e.id === planned.eventId);

    return fromCart ?? nearestEvent(events);
  }, [events, items]);

  const eventId = event?.id ?? null;

  const counts = useMemo(() => {
    const map = new Map<BarCategory, number>();
    for (const item of menu ?? []) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [menu]);

  const visible = useMemo(() => {
    if (!menu) return [];
    return filter === 'all' ? menu : menu.filter((i) => i.category === filter);
  }, [menu, filter]);

  // Итог только по бару и только по выбранной вечеринке: билеты и стол
  // считаются отдельно, иначе панель внизу вводит в заблуждение.
  const barLines = items.filter((i) => i.kind === 'bar' && i.eventId === eventId);
  const barTotal = barLines.reduce((sum, i) => sum + i.price * i.qty, 0);
  const barCount = barLines.reduce((sum, i) => sum + i.qty, 0);

  const qtyOf = (itemId: string) => {
    const lineId = buildLineId('bar', itemId, eventId ?? undefined);
    return items.find((i) => i.lineId === lineId)?.qty ?? 0;
  };

  const changeQty = (item: BarItem, next: number) => {
    if (!eventId) return;
    const lineId = buildLineId('bar', item.id, eventId);
    const current = qtyOf(item.id);

    if (current === 0 && next > 0) {
      add({
        kind: 'bar',
        refId: item.id,
        eventId,
        title: item.name,
        subtitle: item.volume,
        price: item.price,
        qty: next,
      });
      return;
    }

    setQty(lineId, next);
  };


  return (
    <Screen scroll padded={false} contentContainerStyle={styles.scrollBody}>
      <View style={styles.header}>
        <Text variant="label" tone="accent">
          Предзаказ
        </Text>
        <Text variant="display">Бар</Text>
        <Text variant="body" tone="muted" style={styles.lead}>
          Напитки будут ждать к вашему приходу — не придётся стоять в очереди
        </Text>
      </View>

      {events === null || menu === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
          <Text
            variant="caption"
            tone={event ? 'faint' : 'danger'}
            style={styles.eventNote}
          >
            {event
              ? `К вечеринке ${event.title} · ${formatEventDate(new Date(event.date))}`
              : 'Ближайшей вечеринки нет — заказать пока не к чему'}
            {event && canBuy && barCount > 0
              ? ` · ${pluralWithCount(barCount, 'позиция', 'позиции', 'позиций')} на ${formatPrice(barTotal)}`
              : ''}
          </Text>

          <View style={styles.categories}>
            <ChipRow>
              <Chip label="Всё" selected={filter === 'all'} onPress={() => setFilter('all')} />
              {CATEGORY_ORDER.map((c) => (
                <Chip
                  key={c}
                  label={CATEGORY_LABEL[c]}
                  count={counts.get(c) ?? 0}
                  selected={filter === c}
                  onPress={() => setFilter(c)}
                />
              ))}
            </ChipRow>
          </View>

          <View style={styles.list}>
            {visible.map((item) => {
              const qty = qtyOf(item.id);

              return (
                <Card
                  key={item.id}
                  style={[styles.item, !item.available && styles.itemOut]}
                  elevated={qty > 0}
                  selected={qty > 0}
                >
                  <View style={styles.itemBody}>
                    <View style={styles.itemHead}>
                      <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                        {item.name}
                      </Text>
                      {item.popular && item.available && <Badge label="Хит" tone="accent" />}
                    </View>

                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {item.description}
                    </Text>

                    <View style={styles.itemFoot}>
                      <Text variant="subtitle">{formatPrice(item.price)}</Text>
                      <Text variant="caption" tone="faint">
                        {item.volume}
                      </Text>
                    </View>
                  </View>

                  {!item.available ? (
                    <Text variant="caption" tone="danger">
                      Закончилось
                    </Text>
                  ) : !canBuy ? null : (
                    <Stepper value={qty} onChange={(next) => changeQty(item, next)} max={20} />
                  )}
                </Card>
              );
            })}
          </View>
        </>
      )}
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
  eventNote: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  categories: {
    marginTop: spacing.lg,
  },
  center: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  itemOut: {
    opacity: 0.45,
  },
  itemBody: {
    flex: 1,
    gap: spacing.xs,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemFoot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  // Запас снизу под плавающую панель заказа
  scrollBody: {
    paddingBottom: 110,
  },
});
