import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, Segmented, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { GENRE_LABEL, shelfOf, totalAvailable, type EventShelf } from '@/src/lib/events';
import { formatEventDate, formatPrice } from '@/src/lib/format';
import { useCatalogStore } from '@/src/store/catalog';
import { colors, spacing } from '@/src/theme';

/**
 * Вкладки афиши.
 *
 * Прошедшие и отменённые вечеринки никуда не деваются: по ним есть
 * проданные билеты, и удалить их нельзя, не оторвав заказы гостей от
 * названия и даты. Но и лежать вперемешку с ближайшей субботой им
 * незачем — через полгода работы список превратился бы в свалку,
 * где живую вечеринку надо искать глазами.
 */
const SHELVES: { value: EventShelf; label: string }[] = [
  { value: 'live', label: 'Афиша' },
  { value: 'draft', label: 'Черновики' },
  { value: 'past', label: 'Прошли' },
  { value: 'cancelled', label: 'Отменены' },
];

const EMPTY: Record<EventShelf, string> = {
  live: 'Ближайших вечеринок нет. Создайте новую или опубликуйте черновик.',
  draft: 'Черновиков нет. Сюда попадают вечеринки, которые ещё готовятся.',
  past: 'Прошедших вечеринок пока нет.',
  cancelled: 'Отменённых нет — и хорошо.',
};

export default function AdminEvents() {
  const router = useRouter();
  // Читаем прямо из каталога, а не через сервис: список должен обновляться
  // сразу после сохранения, без возврата и перезагрузки экрана.
  const events = useCatalogStore((s) => s.events);

  const [shelf, setShelf] = useState<EventShelf>('live');

  const byShelf = useMemo(() => {
    const groups: Record<EventShelf, typeof events> = {
      live: [],
      draft: [],
      past: [],
      cancelled: [],
    };

    for (const event of events) groups[shelfOf(event)].push(event);

    // Ближайшие сверху, а прошедшие — наоборот: там интересен последний
    groups.live.sort((a, b) => +new Date(a.date) - +new Date(b.date));
    groups.draft.sort((a, b) => +new Date(a.date) - +new Date(b.date));
    groups.past.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    groups.cancelled.sort((a, b) => +new Date(b.date) - +new Date(a.date));

    return groups;
  }, [events]);

  const visible = byShelf[shelf];

  return (
    <Screen scroll>
      <AdminHeader
        title="Афиша"
        subtitle={`${byShelf.live.length} впереди · ${events.length} всего`}
      />

      <Button
        label="Новая вечеринка"
        fullWidth
        icon={<Ionicons name="add" size={18} color={colors.onAccent} />}
        onPress={() => router.push({ pathname: '/admin/event/[id]', params: { id: 'new' } })}
        style={styles.create}
      />

      <View style={styles.tabs}>
        <Segmented
          options={SHELVES.map((s) => ({
            value: s.value,
            // Счётчик прямо на вкладке: видно, где что лежит,
            // не переключаясь по очереди
            label: byShelf[s.value].length > 0 ? `${s.label} ${byShelf[s.value].length}` : s.label,
          }))}
          value={shelf}
          onChange={setShelf}
          // Четыре вкладки со счётчиками в ряд не помещаются на телефоне:
          // равные доли сжали бы подписи до многоточий
          scrollable
        />
      </View>

      <View style={styles.list}>
        {visible.map((event) => {
          const left = totalAvailable(event);

          return (
            <Card
              key={event.id}
              onPress={() =>
                router.push({ pathname: '/admin/event/[id]', params: { id: event.id } })
              }
              style={styles.card}
            >
              <View style={styles.cardHead}>
                <View style={styles.cover}>
                  <View style={[styles.coverDot, { backgroundColor: event.cover[0] }]} />
                </View>

                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {formatEventDate(new Date(event.date))} · {GENRE_LABEL[event.genre]}
                  </Text>
                </View>

                {shelf === 'cancelled' ? (
                  <Badge label="Отменена" tone="danger" />
                ) : shelf === 'draft' ? (
                  <Badge label="Черновик" tone="gold" />
                ) : shelf === 'past' ? (
                  <Badge label="Прошла" tone="neutral" />
                ) : left === 0 ? (
                  <Badge label="Распродано" tone="danger" />
                ) : (
                  <Badge label={`${left} мест`} tone="neutral" />
                )}
              </View>

              <View style={styles.cardFoot}>
                <Text variant="caption" tone="faint">
                  {event.tickets.length} типов билетов
                </Text>
                <Text variant="caption" tone="muted">
                  от {formatPrice(Math.min(...event.tickets.map((t) => t.price)))}
                </Text>
              </View>
            </Card>
          );
        })}

        {visible.length === 0 && (
          <Text variant="body" tone="muted" style={styles.empty}>
            {EMPTY[shelf]}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  create: {
    marginBottom: spacing.lg,
  },
  tabs: {
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
    alignItems: 'center',
    gap: spacing.md,
  },
  cover: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  flex: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
});
