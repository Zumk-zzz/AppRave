import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Badge, Button, Card, OfflineNotice, Screen, Text } from '@/src/components';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { canCancel, CANCEL_BLOCK_TEXT, hoursUntil, REFUND_CUTOFF_HOURS } from '@/src/lib/refund';
import { useCancelOrder } from '@/src/features/orders/useCancelOrder';
import {
  isLineCancellable,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} from '@/src/lib/order-actions';
import type { OrderLine } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { redeemableOf, useOrdersStore } from '@/src/store/orders';
import { colors, fonts, radius, spacing } from '@/src/theme';

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const order = useOrdersStore((s) => s.orders.find((o) => o.id === id));
  const cancelLine = useOrdersStore((s) => s.cancelLine);
  const { ask, cancelling } = useCancelOrder();
  const refreshUser = useAuthStore((s) => s.refresh);

  if (!order) {
    return (
      <Screen>
        <View style={styles.missing}>
          <Text variant="body" tone="muted">
            Билет не найден
          </Text>
          <Button label="Назад" variant="surface" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const ticketLines = order.lines.filter((l) => l.kind === 'ticket');
  const tableLines = order.lines.filter((l) => l.kind === 'table');
  const barLines = order.lines.filter((l) => l.kind === 'bar');

  const handleCancelLine = (line: OrderLine) => {
    const left = redeemableOf(line);

    Alert.alert(
      'Отменить позицию?',
      `«${line.title}» — ${left} шт. Вернём в продажу, деньги придут на карту в течение трёх дней.`,
      [
        { text: 'Оставить', style: 'cancel' },
        {
          text: 'Отменить',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelLine(order.id, line.id, left);
              await refreshUser();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              reportFailure(e);
            }
          },
        },
      ],
    );
  };

  const cancelCheck = canCancel(order);
  const hoursLeft = order.eventDate ? Math.floor(hoursUntil(order.eventDate)) : null;

  const handleCancel = () => ask(order);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.close}
        >
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
        <Badge label={ORDER_STATUS_LABEL[order.status]} tone={ORDER_STATUS_TONE[order.status]} />
      </View>

      <View style={styles.hero}>
        <Text variant="label" tone="accent">
          Ваш билет
        </Text>
        <Text variant="display" style={styles.title}>
          {order.eventTitle ?? 'AppRave'}
        </Text>
        {order.eventDate && (
          <Text variant="body" tone="muted">
            {formatEventDate(new Date(order.eventDate))}
          </Text>
        )}
      </View>

      <OfflineNotice hint="Код действителен — на входе его проверят по базе клуба" />

      {/* QR на белом: сканеры на входе плохо читают код на тёмном фоне */}
      <View style={styles.qrCard}>
        <QRCode value={order.qrPayload} size={216} backgroundColor={colors.qrBackground} color={colors.qrForeground} />
        <Text style={styles.orderNo}>{order.number}</Text>
      </View>

      {order.status === 'refunded' ? (
        <Card style={styles.refunded}>
          <Ionicons name="cash-outline" size={20} color={colors.accent} />
          <View style={styles.refundedText}>
            <Text variant="bodyStrong">Вечеринка отменена</Text>
            <Text variant="caption" tone="muted">
              Клуб вернул {formatPrice(order.total)}. Деньги придут на карту в течение трёх дней.
              Баллы за эту покупку списаны.
            </Text>
          </View>
        </Card>
      ) : (
        <Text variant="caption" tone="faint" style={styles.brightness}>
          Покажите код на входе. Если не считывается — поднимите яркость экрана.
        </Text>
      )}

      <Card style={styles.details}>
        {ticketLines.length > 0 && (
          <Section title="Билеты">
            {ticketLines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                onCancel={isLineCancellable(order, line) ? () => handleCancelLine(line) : undefined}
              />
            ))}
          </Section>
        )}

        {tableLines.length > 0 && (
          <Section title="Стол">
            {tableLines.map((line) => (
              <View key={line.refId} style={styles.tableBlock}>
                <Row left={line.title} right={formatPrice(line.price)} />
                {line.guests && line.guests.length > 0 && (
                  <Text variant="caption" tone="faint" style={styles.guests}>
                    {pluralWithCount(line.guests.length, 'гость', 'гостя', 'гостей')}:{' '}
                    {line.guests.join(', ')}
                  </Text>
                )}
              </View>
            ))}
          </Section>
        )}

        {barLines.length > 0 && (
          <Section title="Бар — получить у стойки">
            {barLines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                onCancel={isLineCancellable(order, line) ? () => handleCancelLine(line) : undefined}
              />
            ))}
          </Section>
        )}

        <View style={styles.totals}>
          <Row left="Оплачено" right={formatPrice(order.total)} strong />
          <Row left="Начислено баллов" right={`+${order.pointsEarned}`} accent />
        </View>
      </Card>

      {(order.status === 'paid' || order.status === 'pending') && (
        <View style={styles.cancelBlock}>
          {cancelCheck.allowed ? (
            <>
              <Button
                label={cancelling === order.id ? 'Отменяем…' : 'Отменить заказ'}
                variant="outline"
                fullWidth
                loading={cancelling === order.id}
                onPress={handleCancel}
              />
              <Text variant="caption" tone="faint" style={styles.cancelNote}>
                Бесплатно до {REFUND_CUTOFF_HOURS} часов до начала
                {hoursLeft !== null ? ` · осталось ${hoursLeft} ч` : ''}
              </Text>
            </>
          ) : (
            <Text variant="caption" tone="faint" style={styles.cancelNote}>
              {CANCEL_BLOCK_TEXT[cancelCheck.reason ?? 'status']}
            </Text>
          )}
        </View>
      )}

      <Button
        label="Мои заказы"
        variant="surface"
        fullWidth
        onPress={() => router.replace('/orders')}
        style={styles.action}
      />
      <Button label="На афишу" variant="ghost" fullWidth onPress={() => router.replace('/(tabs)')} />
    </Screen>
  );
}

/**
 * Сообщение о неудаче.
 *
 * Отмена может не пройти по причине, которую видно только на сервере:
 * гость уже прошёл внутрь, или заказ отменили со второго устройства.
 * Молча оставить кнопку без реакции нельзя — гость нажмёт ещё пять раз.
 */
function reportFailure(e: unknown) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" tone="faint" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Строка состава заказа: название, состояние выдачи и отмена невыданного.
 *
 * Состояние показывается словами, а не значком: «выдано 2 из 3» гость
 * понимает сразу, а иконка требует догадки.
 */
function LineRow({ line, onCancel }: { line: OrderLine; onCancel?: () => void }) {
  const left = redeemableOf(line);
  const cancelledUnits = line.cancelled ?? 0;

  const state =
    line.redeemed >= line.qty
      ? line.kind === 'ticket'
        ? 'Прошли'
        : 'Выдано'
      : line.redeemed > 0
        ? `Выдано ${line.redeemed} из ${line.qty}`
        : cancelledUnits > 0
          ? `Отменено ${cancelledUnits} из ${line.qty}`
          : null;

  return (
    <View style={styles.lineRow}>
      <View style={styles.lineMain}>
        <Text variant="body" tone="muted" style={styles.rowLeft} numberOfLines={1}>
          {line.title}
        </Text>
        <Text variant="body">× {line.qty}</Text>
      </View>

      {(state || onCancel) && (
        <View style={styles.lineMeta}>
          {state && (
            <Text
              variant="caption"
              tone={line.redeemed >= line.qty ? 'success' : cancelledUnits > 0 ? 'danger' : 'accent'}
              style={styles.rowLeft}
            >
              {state}
            </Text>
          )}
          {onCancel && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onCancel}>
              <Text variant="caption" tone="faint">
                Отменить{left < line.qty ? ` (${left})` : ''}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Row({
  left,
  right,
  strong,
  accent,
}: {
  left: string;
  right: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text variant={strong ? 'bodyStrong' : 'body'} tone="muted" style={styles.rowLeft}>
        {left}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'body'} tone={accent ? 'accent' : 'default'}>
        {right}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  // Единственное место, где цвета берутся не из темы: сканеры на входе
  // рассчитаны на чёрный код по белому, любой оттенок снижает читаемость.
  qrCard: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.qrBackground,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  orderNo: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: 2,
    color: colors.qrForeground,
  },
  refunded: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  refundedText: {
    flex: 1,
    gap: 2,
  },
  brightness: {
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  details: {
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  tableBlock: {
    gap: spacing.xs,
  },
  guests: {
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLeft: {
    flex: 1,
  },
  lineRow: {
    gap: 2,
    paddingVertical: 2,
  },
  lineMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  lineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  totals: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  cancelBlock: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  cancelNote: {
    textAlign: 'center',
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
});
