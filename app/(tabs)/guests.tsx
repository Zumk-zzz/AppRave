import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Badge, Button, Card, Chip, ChipRow, Screen, Text } from '@/src/components';
import { pluralWithCount } from '@/src/lib/format';
import { eventsService, type ClubEvent, type Order } from '@/src/services';
import { redeemableOf, useOrdersStore } from '@/src/store/orders';
import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';

/**
 * Список гостей на входе.
 *
 * Главный сценарий — у гостя сел телефон и кода нет. Фейсер находит его
 * по фамилии или номеру заказа и пропускает вручную. Без этого экрана
 * такой гость остаётся на улице, хотя билет оплачен.
 */
export default function GuestsTab() {
  const orders = useOrdersStore((s) => s.orders);
  const redeemEntry = useOrdersStore((s) => s.redeemEntry);

  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const list = await eventsService.list();
        setEvents(list);
        setEventId((current) => current ?? list[0]?.id ?? null);
      })();
    }, []),
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return orders
      .filter((o) => o.eventId === eventId && o.status !== 'cancelled')
      .map((order) => {
        const tickets = order.lines.filter((l) => l.kind === 'ticket');
        const table = order.lines.find((l) => l.kind === 'table');

        return {
          order,
          total: tickets.reduce((n, l) => n + l.qty, 0),
          left: tickets.reduce((n, l) => n + redeemableOf(l), 0),
          table: table?.title,
          guests: table?.guests ?? [],
        };
      })
      .filter((row) => row.total > 0 || row.table)
      .filter((row) => {
        if (!needle) return true;
        // Ищем и по гостевому списку: на входе называют любое имя из брони
        return (
          row.order.id.toLowerCase().includes(needle) ||
          row.guests.some((g) => g.toLowerCase().includes(needle)) ||
          (row.table?.toLowerCase().includes(needle) ?? false)
        );
      });
  }, [orders, eventId, query]);

  const waiting = rows.reduce((n, r) => n + r.left, 0);

  const handleManualAdmit = (order: Order) => {
    Alert.alert(
      'Пропустить без кода?',
      'Гость не показал QR. Отметка попадёт в журнал как ручной пропуск.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Пропустить',
          onPress: () => {
            redeemEntry(order.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  };

  return (
    <Screen scroll padded={false}>
      <View style={styles.header}>
        <Text variant="label" tone="accent">
          Контроль на входе
        </Text>
        <Text variant="display">Гости</Text>
        <Text variant="body" tone="muted" style={styles.lead}>
          {waiting > 0
            ? `Ждём ${pluralWithCount(waiting, 'гостя', 'гостей', 'гостей')}`
            : 'Все, кто купил билет, уже прошли'}
        </Text>
      </View>

      <View style={styles.padded}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Имя гостя, стол или номер заказа"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </View>
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
        {rows.length === 0 ? (
          <Text variant="body" tone="muted" style={styles.center}>
            {query.trim() ? 'Никого не нашлось' : 'На эту вечеринку ещё не покупали'}
          </Text>
        ) : (
          rows.map((row) => (
            <Card key={row.order.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{row.order.id}</Text>
                  {row.table && (
                    <Text variant="caption" tone="accent">
                      {row.table}
                    </Text>
                  )}
                </View>

                {row.total > 0 && (
                  <Badge
                    label={row.left > 0 ? `${row.left} из ${row.total}` : 'Прошли'}
                    tone={row.left > 0 ? 'accent' : 'success'}
                  />
                )}
              </View>

              {row.guests.length > 0 && (
                <Text variant="caption" tone="muted">
                  {pluralWithCount(row.guests.length, 'гость', 'гостя', 'гостей')}:{' '}
                  {row.guests.join(', ')}
                </Text>
              )}

              {row.left > 0 && (
                <Button
                  label="Пропустить без кода"
                  variant="outline"
                  fullWidth
                  onPress={() => handleManualAdmit(row.order)}
                />
              )}
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
  padded: {
    paddingHorizontal: spacing.lg,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text,
    padding: 0,
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
  center: {
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  flex: {
    flex: 1,
  },
});
