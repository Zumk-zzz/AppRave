import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Chip, ChipRow, Screen, Text, ViewOnlyNote } from '@/src/components';
import { ZONE_LABEL } from '@/src/data/tables';
import { FloorLegend, FloorMap } from '@/src/features/tables/FloorMap';
import { GuestListSheet } from '@/src/features/tables/GuestListSheet';
import { nearestEvent } from '@/src/lib/events';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { bookingService, eventsService, type ClubEvent, type ClubTable } from '@/src/services';
import { useCan } from '@/src/store/auth';
import { useCartStore } from '@/src/store/cart';
import { colors, spacing } from '@/src/theme';

export default function TablesTab() {
  const addToCart = useCartStore((s) => s.add);
  const cartItems = useCartStore((s) => s.items);
  // Персонал не покупает: у него нет права purchase
  const canBuy = useCan('purchase');

  const [events, setEvents] = useState<ClubEvent[] | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [tables, setTables] = useState<ClubTable[] | null>(null);
  const [selected, setSelected] = useState<ClubTable | null>(null);
  const [guests, setGuests] = useState<string[]>([]);
  const [guestsOpen, setGuestsOpen] = useState(false);

  // Перечитываем при фокусе: админ мог поменять депозиты или снять стол
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const list = await eventsService.list();
        setEvents(list);

        // Дату здесь оставляем выбираемой: занятость столов от неё зависит,
        // и стол на день рождения через неделю — обычное дело. Но по
        // умолчанию подставляем ту же вечеринку, что уже в корзине,
        // иначе ближайшую — как это делает бар.
        setEventId((current) => {
          if (current) return current;

          const planned = cartItems.find((i) => i.kind !== 'table' && i.eventId);
          return planned?.eventId ?? nearestEvent(list)?.id ?? null;
        });
      })();
    }, []),
  );

  const loadTables = useCallback(async (id: string) => {
    setTables(null);
    setSelected(null);
    setGuests([]);
    setTables(await bookingService.tablesFor(id));
  }, []);

  useEffect(() => {
    if (eventId) void loadTables(eventId);
  }, [eventId, loadTables]);

  const event = events?.find((e) => e.id === eventId) ?? null;

  // Стол уникален: одна бронь на событие. Ключ строки должен совпадать
  // с тем, что соберёт корзина, иначе не найдём уже забронированное.
  const bookedLine = cartItems.find((i) => i.kind === 'table' && i.eventId === eventId);

  const handleSelect = (table: ClubTable) => {
    setSelected(table);
    setGuests([]);
  };

  const handleBook = () => {
    if (!event || !selected) return;

    addToCart({
      kind: 'table',
      refId: selected.id,
      eventId: event.id,
      title: `Стол ${selected.label} · ${ZONE_LABEL[selected.zone]}`,
      subtitle: `${event.title} · ${formatEventDate(new Date(event.date))}`,
      price: selected.deposit,
      guests,
      unique: true,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const isBooked = bookedLine?.lineId === `table:${eventId}:${selected?.id}`;

  return (
    <Screen scroll padded={false} contentContainerStyle={styles.scrollBody}>
      <View style={styles.header}>
        <Text variant="label" tone="accent">
          Бронирование
        </Text>
        <Text variant="display">Столики</Text>
      </View>

      {events === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
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

          {event && (
            <Text variant="caption" tone="muted" style={styles.eventDate}>
              {formatEventDate(new Date(event.date))} · {event.ageLimit}+
            </Text>
          )}

          <View style={styles.padded}>
            {tables === null ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <>
                <FloorMap tables={tables} selectedId={selected?.id ?? null} onSelect={handleSelect} />
                <FloorLegend />

                {canBuy && bookedLine && (
                  <Card style={styles.booked}>
                    <View style={styles.bookedRow}>
                      <View style={styles.flex}>
                        <Text variant="bodyStrong">{bookedLine.title}</Text>
                        <Text variant="caption" tone="muted">
                          Депозит {formatPrice(bookedLine.price)}
                          {bookedLine.guests && bookedLine.guests.length > 0
                            ? ` · ${pluralWithCount(bookedLine.guests.length, 'гость', 'гостя', 'гостей')}`
                            : ''}
                        </Text>
                      </View>
                      <Badge label="В заказе" tone="success" />
                    </View>
                  </Card>
                )}

                {selected ? (
                  <Card style={styles.details}>
                    <View style={styles.detailsHead}>
                      <View style={styles.flex}>
                        <Text variant="title">Стол {selected.label}</Text>
                        <Text variant="caption" tone="muted">
                          {ZONE_LABEL[selected.zone]} ·{' '}
                          {pluralWithCount(selected.seats, 'место', 'места', 'мест')}
                        </Text>
                      </View>
                      <View style={styles.depositBox}>
                        <Text variant="caption" tone="faint">
                          Депозит
                        </Text>
                        <Text variant="subtitle">{formatPrice(selected.deposit)}</Text>
                      </View>
                    </View>

                    <Text variant="caption" tone="muted" style={styles.depositNote}>
                      Депозит целиком идёт в счёт заказа — это не плата за сам стол.
                    </Text>

                    {!canBuy ? (
                      <ViewOnlyNote text="Режим администратора: схема доступна для проверки, бронирование — нет." />
                    ) : (
                      <>
                        <Button
                          label={
                            guests.length > 0
                              ? `Гости · ${pluralWithCount(guests.length, 'гость', 'гостя', 'гостей')}`
                              : 'Добавить гостей'
                          }
                          variant="outline"
                          fullWidth
                          onPress={() => setGuestsOpen(true)}
                        />

                        <Button
                          label={isBooked ? 'Обновить бронь' : 'Забронировать'}
                          size="lg"
                          fullWidth
                          onPress={handleBook}
                        />
                      </>
                    )}
                  </Card>
                ) : (
                  <Text variant="caption" tone="faint" style={styles.pickHint}>
                    Выберите стол на схеме
                  </Text>
                )}
              </>
            )}
          </View>
        </>
      )}

      <GuestListSheet
        visible={guestsOpen}
        onClose={() => setGuestsOpen(false)}
        guests={guests}
        onChange={setGuests}
        seats={selected?.seats ?? 1}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  padded: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  eventDate: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  center: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  booked: {
    marginTop: spacing.lg,
  },
  bookedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  details: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  detailsHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  depositBox: {
    alignItems: 'flex-end',
  },
  depositNote: {
    marginTop: -spacing.sm,
  },
  flex: {
    flex: 1,
  },
  pickHint: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  // Запас снизу под плавающую панель заказа
  scrollBody: {
    paddingBottom: 110,
  },
});
