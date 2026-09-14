import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Button, Card, Stepper, Text, ViewOnlyNote } from '@/src/components';
import { GENRE_LABEL, isTicketSoldOut } from '@/src/lib/events';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { eventsService, type ClubEvent, type TicketType } from '@/src/services';
import { useIsAdmin } from '@/src/store/auth';
import { selectCount, useCartStore } from '@/src/store/cart';
import { colors, radius, spacing } from '@/src/theme';

const SCRIM = ['rgba(10,10,11,0)', 'rgba(10,10,11,0.7)', 'rgba(10,10,11,1)'] as const;

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const addToCart = useCartStore((s) => s.add);
  const cartCount = useCartStore(selectCount);
  const isAdmin = useIsAdmin();

  const [event, setEvent] = useState<ClubEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      const found = await eventsService.byId(id ?? '');
      if (!alive) return;

      setEvent(found);
      setLoading(false);
      // Предвыбираем первый доступный тип: пользователю остаётся только
      // подтвердить, а не начинать с пустого экрана.
      setSelectedId(found?.tickets.find((t) => !isTicketSoldOut(t))?.id ?? null);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const selected = useMemo<TicketType | null>(
    () => event?.tickets.find((t) => t.id === selectedId) ?? null,
    [event, selectedId],
  );

  const maxQty = selected ? Math.min(selected.available, 10) : 1;
  const total = selected ? selected.price * qty : 0;

  const handleAdd = () => {
    if (!event || !selected) return;

    addToCart({
      kind: 'ticket',
      refId: selected.id,
      eventId: event.id,
      title: `${event.title} · ${selected.name}`,
      subtitle: formatEventDate(new Date(event.date)),
      price: selected.price,
      qty,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1600);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.loading}>
        <Text variant="body" tone="muted">
          Событие не найдено
        </Text>
        <Button label="Назад" variant="surface" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
      >
        {/* Обложка */}
        <View style={styles.hero}>
          <LinearGradient
            colors={event.cover}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient colors={SCRIM} style={StyleSheet.absoluteFill} />

          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xxxl }]}>
            <Text variant="label" tone="accent">
              {formatEventDate(new Date(event.date))}
            </Text>
            <Text variant="display" style={styles.heroTitle}>
              {event.title}
            </Text>
            <Text variant="body" tone="muted">
              {event.subtitle}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.badges}>
            <Badge label={GENRE_LABEL[event.genre]} tone="neutral" />
            <Badge label={`${event.ageLimit}+`} tone="neutral" />
            <Badge
              label={pluralWithCount(event.lineup.length, 'диджей', 'диджея', 'диджеев')}
              tone="neutral"
            />
          </View>

          <Text variant="body" tone="muted" style={styles.description}>
            {event.description}
          </Text>

          <Text variant="label" tone="faint" style={styles.blockLabel}>
            Лайнап
          </Text>
          <View style={styles.lineup}>
            {event.lineup.map((dj) => (
              <View key={dj} style={styles.lineupRow}>
                <View style={styles.lineupDot} />
                <Text variant="bodyStrong">{dj}</Text>
              </View>
            ))}
          </View>

          <Text variant="label" tone="faint" style={styles.blockLabel}>
            Билеты
          </Text>
          <View style={styles.tickets}>
            {event.tickets.map((ticket) => {
              const soldOut = isTicketSoldOut(ticket);
              return (
                <Card
                  key={ticket.id}
                  elevated
                  selected={ticket.id === selectedId}
                  onPress={
                    soldOut
                      ? undefined
                      : () => {
                          setSelectedId(ticket.id);
                          setQty(1);
                        }
                  }
                  style={soldOut ? styles.ticketSoldOut : undefined}
                >
                  <View style={styles.ticketRow}>
                    <View style={styles.flex}>
                      <Text variant="bodyStrong">{ticket.name}</Text>
                      <Text variant="caption" tone="muted">
                        {ticket.description}
                      </Text>
                      {soldOut ? (
                        <Text variant="caption" tone="danger" style={styles.ticketNote}>
                          Распродано
                        </Text>
                      ) : ticket.available <= 10 ? (
                        <Text variant="caption" tone="accent" style={styles.ticketNote}>
                          Осталось {ticket.available}
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="subtitle">{formatPrice(ticket.price)}</Text>
                  </View>
                </Card>
              );
            })}
          </View>

          {selected && !isAdmin && (
            <View style={styles.qtyRow}>
              <View>
                <Text variant="bodyStrong">Количество</Text>
                <Text variant="caption" tone="muted">
                  Максимум {maxQty} на человека
                </Text>
              </View>
              <Stepper value={qty} onChange={setQty} min={1} max={maxQty} />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Кнопка «назад» поверх обложки */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={12}
        onPress={() => router.back()}
        style={[styles.back, { top: insets.top + spacing.sm }]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>

      {/* Панель покупки. Администратору вместо неё — пояснение:
          он видит афишу глазами гостя, но купить не может. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {isAdmin ? (
          <ViewOnlyNote text="Режим администратора: так карточку видит гость. Покупка недоступна." />
        ) : (
          <>
            <View style={styles.footerInfo}>
              <Text variant="caption" tone="faint">
                {selected ? `${selected.name} × ${qty}` : 'Нет доступных билетов'}
              </Text>
              <Text variant="title">{formatPrice(total)}</Text>
            </View>

            <Button
              label={justAdded ? 'Добавлено' : 'В заказ'}
              size="lg"
              disabled={!selected}
              onPress={handleAdd}
              style={styles.footerButton}
            />
          </>
        )}
      </View>

      {!isAdmin && cartCount > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/checkout')}
          style={[styles.cartHint, { bottom: insets.bottom + 92 }]}
        >
          <Text variant="caption" tone="accent">
            В заказе {pluralWithCount(cartCount, 'позиция', 'позиции', 'позиций')} · оформить
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.bg,
  },
  scrollBody: {
    paddingBottom: 140,
  },
  hero: {
    height: 340,
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 38,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  description: {
    marginTop: spacing.lg,
  },
  blockLabel: {
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  lineup: {
    gap: spacing.md,
  },
  lineupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  lineupDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  tickets: {
    gap: spacing.md,
  },
  ticketSoldOut: {
    opacity: 0.45,
  },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ticketNote: {
    marginTop: 2,
  },
  flex: {
    flex: 1,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  back: {
    position: 'absolute',
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,11,0.55)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerInfo: {
    flex: 1,
  },
  footerButton: {
    minWidth: 140,
  },
  cartHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
