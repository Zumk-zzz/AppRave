import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, OfflineNotice, Screen, Text } from '@/src/components';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/src/lib/order-actions';
import { canCancel, CANCEL_BLOCK_TEXT } from '@/src/lib/refund';
import { useCancelOrder } from '@/src/features/orders/useCancelOrder';
import type { Order } from '@/src/services';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

export default function OrdersScreen() {
  const router = useRouter();
  const orders = useOrdersStore((s) => s.orders);
  const { ask, cancelling } = useCancelOrder();

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

      <OfflineNotice hint="Билеты сохранены — QR на входе покажется" />

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
              busy={cancelling === order.id}
              onPress={() => router.push({ pathname: '/ticket/[id]', params: { id: order.id } })}
              onCancel={() => ask(order)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function OrderCard({
  order,
  busy,
  onPress,
  onCancel,
}: {
  order: Order;
  busy: boolean;
  onPress: () => void;
  onCancel: () => void;
}) {
  const totalItems = order.lines.reduce((sum, l) => sum + l.qty, 0);
  const isPast = order.eventDate ? new Date(order.eventDate).getTime() < Date.now() : false;
  const check = canCancel(order);
  // Заказ ещё «живой»: по завершённому и отменённому объяснять нечего
  const active = order.status === 'paid' || order.status === 'pending';

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
          // Прошедшая вечеринка по оплаченному заказу — «Прошёл»: билет
          // действителен, но предъявлять его уже некуда
          label={order.status === 'paid' && isPast ? 'Прошёл' : ORDER_STATUS_LABEL[order.status]}
          tone={order.status === 'paid' && isPast ? 'neutral' : ORDER_STATUS_TONE[order.status]}
        />
      </View>

      <View style={styles.cardFoot}>
        <Text variant="caption" tone="faint">
          {order.number} · {pluralWithCount(totalItems, 'позиция', 'позиции', 'позиций')}
        </Text>
        <Text variant="bodyStrong">{formatPrice(order.total)}</Text>
      </View>

      {/* Отмена прямо в списке: раньше до неё нужно было догадаться
          открыть билет. А когда отменить нельзя — говорим почему:
          пустое место читается как «функции нет», и её начинают искать */}
      {active &&
        (check.allowed ? (
          <Button
            label={busy ? 'Отменяем…' : 'Отменить заказ'}
            variant="ghost"
            fullWidth
            loading={busy}
            onPress={onCancel}
          />
        ) : (
          <Text variant="caption" tone="faint" style={styles.cancelNote}>
            {CANCEL_BLOCK_TEXT[check.reason ?? 'status']}
          </Text>
        ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  cancelNote: {
    textAlign: 'center',
  },
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
