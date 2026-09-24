import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Badge, Button, Card, Chip, ChipRow, Field, Screen, Segmented, Sheet, Text } from '@/src/components';
import { pluralWithCount } from '@/src/lib/format';
import { eventsService, type ClubEvent, type Order } from '@/src/services';
import { formatContact } from '@/src/lib/contact';
import { useAuthStore, useRole } from '@/src/store/auth';
import { redeemableOf, useOrdersStore } from '@/src/store/orders';
import { useStaffStore } from '@/src/store/staff';
import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';

/**
 * Список гостей на входе.
 *
 * Главный сценарий — у гостя сел телефон и кода нет. Фейсер находит его
 * по фамилии или номеру заказа и пропускает вручную. Без этого экрана
 * такой гость остаётся на улице, хотя билет оплачен.
 */
export default function GuestsTab() {
  const orders = useOrdersStore((s) => s.staffOrders);
  const loadStaff = useOrdersStore((s) => s.loadStaff);
  const admit = useOrdersStore((s) => s.admit);

  const me = useAuthStore((s) => s.user);
  const myRole = useRole();
  const bans = useStaffStore((s) => s.bans);
  const addBan = useStaffStore((s) => s.addBan);
  const liftBan = useStaffStore((s) => s.liftBan);

  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'list' | 'bans'>('list');
  const [banTarget, setBanTarget] = useState<{ contact: string; name?: string } | null>(null);
  const [reason, setReason] = useState('');

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const list = await eventsService.list();
        setEvents(list);
        setEventId((current) => current ?? list[0]?.id ?? null);
      })();
    }, []),
  );

  // Список перечитывается при каждом возвращении на вкладку: на входе
  // одновременно работают несколько человек, и устаревший список значит
  // пропущенного дважды гостя
  useFocusEffect(
    useCallback(() => {
      if (eventId) void loadStaff(eventId);
    }, [eventId, loadStaff]),
  );

  const activeBans = useMemo(() => bans.filter((b) => !b.liftedAt), [bans]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return orders
      .filter((o) => o.eventId === eventId && o.status !== 'cancelled')
      .map((order) => {
        const tickets = order.lines.filter((l) => l.kind === 'ticket');
        const table = order.lines.find((l) => l.kind === 'table');
        // Контакт приходит с сервера. Без него — третье поле QR: номер
        // карты в автономном режиме, и он тоже опознаёт человека
        const contact = order.guest?.contact ?? order.qrPayload.split('|')[2];

        return {
          order,
          contact,
          ban: activeBans.find((b) => b.contact === contact),
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
          row.order.number.toLowerCase().includes(needle) ||
          (row.order.guest?.name.toLowerCase().includes(needle) ?? false) ||
          row.guests.some((g) => g.toLowerCase().includes(needle)) ||
          (row.table?.toLowerCase().includes(needle) ?? false)
        );
      });
  }, [orders, eventId, query, activeBans]);

  const waiting = rows.reduce((n, r) => n + r.left, 0);

  const handleBan = async () => {
    if (!banTarget || reason.trim().length < 3 || !me) return;

    try {
      await addBan({ contact: banTarget.contact, name: banTarget.name, reason: reason.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setBanTarget(null);
      setReason('');
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
    }
  };

  const handleManualAdmit = (order: Order, ban?: { reason: string }) => {
    if (ban) {
      // Отказ не обходится «на всякий случай»: если решение изменилось,
      // его надо явно снять в стоп-листе, и это останется в истории
      Alert.alert('Гость в стоп-листе', `Причина: ${ban.reason}

Снимите отказ, если решение изменилось.`);
      return;
    }

    Alert.alert(
      'Пропустить без кода?',
      'Гость не показал QR. Отметка попадёт в журнал как ручной пропуск.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Пропустить',
          onPress: () => {
            void (async () => {
              try {
                await admit(order, true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
              }
            })();
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

      <View style={styles.padded}>
        <Segmented
          options={[
            { value: 'list', label: 'Гости' },
            {
              value: 'bans',
              label: activeBans.length > 0 ? `Стоп-лист · ${activeBans.length}` : 'Стоп-лист',
            },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'bans' ? (
        <View style={styles.list}>
          {activeBans.length === 0 ? (
            <Text variant="body" tone="muted" style={styles.center}>
              Стоп-лист пуст. Сюда попадают те, кому отказано во входе.
            </Text>
          ) : (
            activeBans.map((ban) => (
              <Card key={ban.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">{ban.name ?? formatContact(ban.contact)}</Text>
                    <Text variant="caption" tone="faint">
                      {ban.contact}
                    </Text>
                  </View>
                  <Badge label="Отказ" tone="danger" />
                </View>

                <Text variant="body" tone="muted">
                  {ban.reason}
                </Text>

                <Button
                  label="Снять отказ"
                  variant="ghost"
                  fullWidth
                  onPress={() => void liftBan(ban.id)}
                />
              </Card>
            ))
          )}
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
                  <Text variant="bodyStrong">{row.order.number}</Text>
                  {row.table && (
                    <Text variant="caption" tone="accent">
                      {row.table}
                    </Text>
                  )}
                </View>

                {row.ban ? (
                  <Badge label="Отказ" tone="danger" />
                ) : row.total > 0 ? (
                  <Badge
                    label={row.left > 0 ? `${row.left} из ${row.total}` : 'Прошли'}
                    tone={row.left > 0 ? 'accent' : 'success'}
                  />
                ) : null}
              </View>

              {row.guests.length > 0 && (
                <Text variant="caption" tone="muted">
                  {pluralWithCount(row.guests.length, 'гость', 'гостя', 'гостей')}:{' '}
                  {row.guests.join(', ')}
                </Text>
              )}

              {row.ban && (
                <Text variant="caption" tone="danger">
                  Отказ во входе: {row.ban.reason}
                </Text>
              )}

              {row.left > 0 && (
                <Button
                  label={row.ban ? 'В стоп-листе' : 'Пропустить без кода'}
                  variant="outline"
                  fullWidth
                  onPress={() => handleManualAdmit(row.order, row.ban)}
                />
              )}

              {!row.ban && (
                <Button
                  label="Отказать во входе"
                  variant="ghost"
                  fullWidth
                  onPress={() =>
                    setBanTarget({
                      contact: row.contact,
                      name: row.order.guest?.name ?? row.guests[0] ?? row.order.number,
                    })
                  }
                />
              )}
            </Card>
          ))
        )}
      </View>
      </>
      )}

      <Sheet
        visible={banTarget !== null}
        onClose={() => {
          setBanTarget(null);
          setReason('');
        }}
        title="Отказать во входе"
      >
        <View style={styles.sheet}>
          <Text variant="body" tone="muted">
            Гость попадёт в стоп-лист. При сканировании кода отказ увидит любой
            сотрудник на входе.
          </Text>

          <Field
            label="Причина"
            value={reason}
            onChangeText={setReason}
            placeholder="Драка 12.09, отказ администрации"
            multiline
            hint="Причина обязательна: через месяц никто не вспомнит, за что"
          />

          <Button
            label="Внести в стоп-лист"
            size="lg"
            fullWidth
            disabled={reason.trim().length < 3}
            onPress={handleBan}
          />
        </View>
      </Sheet>
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
  sheet: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
