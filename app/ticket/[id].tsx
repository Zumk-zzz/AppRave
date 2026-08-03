import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Badge, Button, Card, Screen, Text } from '@/src/components';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { useOrdersStore } from '@/src/store/orders';
import { colors, fonts, radius, spacing } from '@/src/theme';

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const order = useOrdersStore((s) => s.orders.find((o) => o.id === id));

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
        <Badge
          label={order.status === 'used' ? 'Использован' : 'Оплачено'}
          tone={order.status === 'used' ? 'neutral' : 'success'}
        />
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

      {/* QR на белом: сканеры на входе плохо читают код на тёмном фоне */}
      <View style={styles.qrCard}>
        <QRCode value={order.qrPayload} size={216} backgroundColor="#FFFFFF" color="#0A0A0B" />
        <Text style={styles.orderNo}>{order.id}</Text>
      </View>

      <Text variant="caption" tone="faint" style={styles.brightness}>
        Покажите код на входе. Если не считывается — поднимите яркость экрана.
      </Text>

      <Card style={styles.details}>
        {ticketLines.length > 0 && (
          <Section title="Билеты">
            {ticketLines.map((l, i) => (
              <Row key={i} left={l.title} right={`× ${l.qty}`} />
            ))}
          </Section>
        )}

        {tableLines.length > 0 && (
          <Section title="Стол">
            {tableLines.map((l, i) => (
              <View key={i} style={styles.tableBlock}>
                <Row left={l.title} right={formatPrice(l.price)} />
                {l.guests && l.guests.length > 0 && (
                  <Text variant="caption" tone="faint" style={styles.guests}>
                    {pluralWithCount(l.guests.length, 'гость', 'гостя', 'гостей')}:{' '}
                    {l.guests.join(', ')}
                  </Text>
                )}
              </View>
            ))}
          </Section>
        )}

        {barLines.length > 0 && (
          <Section title="Бар — ждёт к приходу">
            {barLines.map((l, i) => (
              <Row key={i} left={l.title} right={`× ${l.qty}`} />
            ))}
          </Section>
        )}

        <View style={styles.totals}>
          <Row left="Оплачено" right={formatPrice(order.total)} strong />
          <Row left="Начислено баллов" right={`+${order.pointsEarned}`} accent />
        </View>
      </Card>

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
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  orderNo: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: 2,
    color: '#0A0A0B',
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
  totals: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
});
