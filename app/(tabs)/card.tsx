import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Badge, Card, OfflineNotice, Screen, SectionHeader, Text } from '@/src/components';
import { formatPrice, formatShortDate } from '@/src/lib/format';
import {
  nextTier,
  pointsToNextTier,
  TIER_COLOR,
  TIER_GRADIENT,
  TIER_LABEL,
  TIER_ORDER,
  TIER_PERKS,
  TIER_RATE,
  TIER_THRESHOLD,
  TIER_TONE,
  tierProgress,
} from '@/src/lib/loyalty';
import { useAuthStore } from '@/src/store/auth';
import { useOrdersStore } from '@/src/store/orders';
import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';

export default function CardTab() {
  const user = useAuthStore((s) => s.user);
  const orders = useOrdersStore((s) => s.orders);

  if (!user) return null;

  const tier = user.tier;
  const upcoming = nextTier(tier);
  const progress = tierProgress(user.points);
  const remaining = pointsToNextTier(user.points);
  // Отменённое и возвращённое не считается ни визитом, ни тратой:
  // деньги вернулись гостю, и завышенные цифры на карте — обман
  const counted = orders.filter((o) => o.status === 'paid' || o.status === 'used');
  const visits = counted.length;
  const spent = counted.reduce((sum, o) => sum + o.total, 0);

  return (
    <Screen scroll contentContainerStyle={styles.scrollBody}>
      <SectionHeader title="Клубная карта" kicker="Лояльность" />

      <OfflineNotice hint="Карта и номер работают без сети" />

      {/* Карта */}
      <View style={styles.card}>
        <LinearGradient
          colors={TIER_GRADIENT[tier]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.cardTop}>
          <View>
            <Text variant="label" style={{ color: TIER_COLOR[tier] }}>
              AppRave
            </Text>
            <Text variant="title" style={styles.tierName}>
              {TIER_LABEL[tier]}
            </Text>
          </View>

          {/* QR карты = номер участника, его сканируют на кассе и входе */}
          <View style={styles.cardQr}>
            <QRCode value={user.memberNo} size={64} backgroundColor={colors.qrBackground} color={colors.qrForeground} />
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View>
            <Text variant="caption" style={styles.cardMuted}>
              Владелец
            </Text>
            <Text variant="bodyStrong">{user.name}</Text>
          </View>
          <View style={styles.cardNo}>
            <Text variant="caption" style={styles.cardMuted}>
              Номер
            </Text>
            <Text style={styles.memberNo}>{user.memberNo}</Text>
          </View>
        </View>
      </View>

      {/* Баллы и прогресс */}
      <Card style={styles.points}>
        <View style={styles.pointsHead}>
          <View>
            <Text variant="caption" tone="faint">
              Накоплено баллов
            </Text>
            <Text variant="display" style={styles.pointsValue}>
              {user.points}
            </Text>
          </View>
          <Badge label={`${Math.round(TIER_RATE[tier] * 100)}% возврат`} tone={TIER_TONE[tier]} />
        </View>

        {upcoming ? (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(progress * 100)}%`, backgroundColor: TIER_COLOR[upcoming] },
                ]}
              />
            </View>
            <Text variant="caption" tone="muted">
              До уровня {TIER_LABEL[upcoming]} осталось {remaining} баллов
            </Text>
          </>
        ) : (
          <Text variant="caption" tone="muted">
            Максимальный уровень. Дальше только бесплатные бутылки.
          </Text>
        )}

        <View style={styles.stats}>
          <Stat value={String(visits)} label="Заказов" />
          <Stat value={formatPrice(spent)} label="Потрачено" />
          <Stat value={formatShortDate(new Date(user.joinedAt))} label="С нами с" />
        </View>
      </Card>

      {/* Привилегии текущего уровня */}
      <SectionHeader title="Ваши привилегии" kicker={TIER_LABEL[tier]} />
      <Card style={styles.perks}>
        {TIER_PERKS[tier].map((perk) => (
          <View key={perk} style={styles.perkRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text variant="body" style={styles.flex}>
              {perk}
            </Text>
          </View>
        ))}
      </Card>

      {/* Все уровни */}
      <SectionHeader title="Уровни" kicker="Как расти" />
      <View style={styles.tiers}>
        {TIER_ORDER.map((t) => {
          const isCurrent = t === tier;
          const reached = user.points >= TIER_THRESHOLD[t];

          return (
            <Card key={t} selected={isCurrent} style={styles.tierRow}>
              <View style={styles.tierDot}>
                <View style={[styles.tierDotInner, { backgroundColor: TIER_COLOR[t] }]} />
              </View>

              <View style={styles.flex}>
                <Text variant="bodyStrong">{TIER_LABEL[t]}</Text>
                <Text variant="caption" tone="muted">
                  От {TIER_THRESHOLD[t]} баллов · возврат {Math.round(TIER_RATE[t] * 100)}%
                </Text>
              </View>

              {isCurrent ? (
                <Badge label="Ваш" tone="accent" />
              ) : reached ? (
                <Ionicons name="checkmark" size={18} color={colors.textFaint} />
              ) : null}
            </Card>
          );
        })}
      </View>

      <Text variant="caption" tone="faint" style={styles.note}>
        Баллы начисляются после оплаты заказа и не сгорают.
      </Text>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="bodyStrong">{value}</Text>
      <Text variant="caption" tone="faint">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollBody: {
    paddingBottom: 110,
  },
  card: {
    height: 200,
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: spacing.lg,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tierName: {
    marginTop: 2,
  },
  cardQr: {
    backgroundColor: colors.qrBackground,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardMuted: {
    color: 'rgba(255,255,255,0.55)',
  },
  cardNo: {
    alignItems: 'flex-end',
  },
  memberNo: {
    fontFamily: fonts.display,
    fontSize: fontSize.lg,
    letterSpacing: 2,
    color: colors.text,
  },
  points: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  pointsHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pointsValue: {
    fontSize: 40,
    lineHeight: 46,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  perks: {
    gap: spacing.md,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tiers: {
    gap: spacing.md,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  tierDot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierDotInner: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
  },
  flex: {
    flex: 1,
  },
  note: {
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
