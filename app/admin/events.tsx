import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { GENRE_LABEL, totalAvailable } from '@/src/lib/events';
import { formatEventDate, formatPrice } from '@/src/lib/format';
import { useCatalogStore } from '@/src/store/catalog';
import { colors, spacing } from '@/src/theme';

export default function AdminEvents() {
  const router = useRouter();
  // Читаем прямо из каталога, а не через сервис: список должен обновляться
  // сразу после сохранения, без возврата и перезагрузки экрана.
  const events = useCatalogStore((s) => s.events);

  const sorted = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return (
    <Screen scroll>
      <AdminHeader title="Афиша" subtitle={`${events.length} вечеринок`} />

      <Button
        label="Новая вечеринка"
        fullWidth
        icon={<Ionicons name="add" size={18} color={colors.onAccent} />}
        onPress={() => router.push({ pathname: '/admin/event/[id]', params: { id: 'new' } })}
        style={styles.create}
      />

      <View style={styles.list}>
        {sorted.map((event) => {
          const left = totalAvailable(event);
          const past = new Date(event.date).getTime() < Date.now();

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

                {past ? (
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

        {events.length === 0 && (
          <Text variant="body" tone="muted" style={styles.empty}>
            Афиша пуста. Создайте первую вечеринку.
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  create: {
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
