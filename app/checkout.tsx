import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, Stepper, Text } from '@/src/components';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { pointsForPurchase } from '@/src/lib/loyalty';
import { eventsService, type ClubEvent } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { selectTotal, useCartStore, type CartItem } from '@/src/store/cart';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

export default function CheckoutScreen() {
  const router = useRouter();

  const items = useCartStore((s) => s.items);
  const total = useCartStore(selectTotal);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clearCart = useCartStore((s) => s.clear);

  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const checkout = useOrdersStore((s) => s.checkout);

  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    void eventsService.list().then(setEvents);
  }, []);

  /** Группируем по вечеринке: один заказ и один QR на одну ночь. */
  const groups = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of items) {
      const key = item.eventId ?? 'no-event';
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [items]);

  const points = pointsForPurchase(total);

  const handlePay = async () => {
    if (!user || items.length === 0 || paying) return;

    setPaying(true);

    // Имитация обращения к платёжному шлюзу. Настоящий эквайринг
    // появится на этапе dev build - в Expo Go нативный SDK не поднять.
    await new Promise((resolve) => setTimeout(resolve, 1600));

    const created = await checkout(items, events, user.memberNo);
    const earned = created.reduce((sum, o) => sum + o.pointsEarned, 0);

    patchUser({ points: user.points + earned });
    clearCart();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPaying(false);

    // replace, а не push: возвращаться на пустую корзину незачем
    router.replace({ pathname: '/ticket/[id]', params: { id: created[0].id } });
  };

  if (items.length === 0) {
    return (
      <Screen>
        <Header onBack={() => router.back()} title="Заказ" />
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={40} color={colors.textFaint} />
          <Text variant="body" tone="muted" style={styles.emptyText}>
            Корзина пуста
          </Text>
          <Button label="К афише" variant="surface" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text variant="body" tone="muted">
              Итого
            </Text>
            <Text variant="title">{formatPrice(total)}</Text>
          </View>
          <View style={styles.footerRow}>
            <Text variant="caption" tone="faint">
              Начислим баллов
            </Text>
            <Text variant="caption" tone="accent">
              +{points}
            </Text>
          </View>
          <Button
            label={paying ? 'Обработка…' : `Оплатить ${formatPrice(total)}`}
            size="lg"
            fullWidth
            loading={paying}
            onPress={handlePay}
            style={styles.payButton}
          />
          <Text variant="caption" tone="faint" style={styles.demo}>
            Демо-режим — деньги не списываются
          </Text>
        </View>
      }
    >
      <Header onBack={() => router.back()} title="Заказ" />

      {groups.map(([eventId, lines]) => {
        const event = events.find((e) => e.id === eventId);
        const groupTotal = lines.reduce((sum, i) => sum + i.price * i.qty, 0);

        return (
          <View key={eventId} style={styles.group}>
            <View style={styles.groupHead}>
              <Text variant="subtitle">{event?.title ?? 'Заказ'}</Text>
              {event && (
                <Text variant="caption" tone="muted">
                  {formatEventDate(new Date(event.date))}
                </Text>
              )}
            </View>

            <View style={styles.lines}>
              {lines.map((line) => (
                <Card key={line.lineId} style={styles.line}>
                  <View style={styles.lineHead}>
                    <View style={styles.flex}>
                      <Text variant="bodyStrong">{line.title}</Text>
                      {line.subtitle && (
                        <Text variant="caption" tone="muted">
                          {line.subtitle}
                        </Text>
                      )}
                    </View>
                    <Text variant="bodyStrong">{formatPrice(line.price * line.qty)}</Text>
                  </View>

                  {line.guests && line.guests.length > 0 && (
                    <View style={styles.guests}>
                      <Text variant="caption" tone="faint">
                        {pluralWithCount(line.guests.length, 'гость', 'гостя', 'гостей')}:{' '}
                        {line.guests.join(', ')}
                      </Text>
                    </View>
                  )}

                  <View style={styles.lineFoot}>
                    {line.kind === 'table' ? (
                      <Badge label="Депозит" tone="neutral" />
                    ) : (
                      <Stepper
                        value={line.qty}
                        onChange={(next) => setQty(line.lineId, next)}
                        min={0}
                        max={20}
                      />
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Убрать ${line.title}`}
                      hitSlop={10}
                      onPress={() => {
                        Haptics.selectionAsync();
                        remove(line.lineId);
                      }}
                    >
                      <Text variant="caption" tone="faint">
                        Убрать
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>

            <View style={styles.groupTotal}>
              <Text variant="caption" tone="faint">
                За эту ночь
              </Text>
              <Text variant="caption" tone="muted">
                {formatPrice(groupTotal)}
              </Text>
            </View>
          </View>
        );
      })}

      {groups.length > 1 && (
        <Text variant="caption" tone="faint" style={styles.multiNote}>
          На каждую вечеринку будет свой билет с отдельным QR-кодом
        </Text>
      )}
    </Screen>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={12}
        onPress={onBack}
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={22} color={colors.textMuted} />
      </Pressable>
      <Text variant="title">{title}</Text>
    </View>
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
  group: {
    marginBottom: spacing.xxl,
  },
  groupHead: {
    marginBottom: spacing.md,
  },
  lines: {
    gap: spacing.md,
  },
  line: {
    gap: spacing.md,
  },
  lineHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  guests: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  lineFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  multiNote: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  emptyText: {
    textAlign: 'center',
  },
  footer: {
    gap: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payButton: {
    marginTop: spacing.md,
  },
  demo: {
    textAlign: 'center',
  },
});
