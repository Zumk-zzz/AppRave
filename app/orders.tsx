import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, Text } from '@/src/components';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import type { Order } from '@/src/services';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

export default function OrdersScreen() {
  const router = useRouter();
  const orders = useOrdersStore((s) => s.orders);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textMuted} />
        </Pressable>
        <Text variant="title">Мои заказы</Text>
      </View>

      {orders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="ticket-outline" size={40} color={colors.textFaint} />
          <Text variant="body" tone="muted" style={styles.emptyText}>
            Здесь появятся билеты и брони{'\n'}после первой покупки
          </Text>
          <Button label="К афише" variant="surface" onPress={() => router.replace('/(tabs)')} />
        </View>
      ) : (
        <View style={styles.list}>
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onPress={() => router.push({ pathname: '/ticket/[id]', params: { id: order.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const totalItems = order.lines.reduce((sum, l) => sum + l.qty, 0);
  const isPast = order.eventDate ? new Date(order.eventDate).getTime() < Date.now() : false;

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text variant="subtitle" numberOfLines={1}>
            {order.eventTitle ?? 'Заказ'}
          </Text>
          {order.eventDate && (
            <Text variant="caption" tone="muted">
              {formatEventDate(new Date(order.eventDate))}
            </Text>
          )}
        </View>
        <Badge
          label={order.status === 'used' ? 'Использован' : isPast ? 'Прошёл' : 'Оплачено'}
          tone={order.status === 'used' || isPast ? 'neutral' : 'success'}
        />
      </View>

      <View style={styles.cardFoot}>
        <Text variant="caption" tone="faint">
          {order.id} · {pluralWithCount(totalItems, 'позиция', 'позиции', 'позиций')}
        </Text>
        <Text variant="bodyStrong">{formatPrice(order.total)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.lg,
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
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xxxl,
  },
  emptyText: {
    textAlign: 'center',
  },
});
