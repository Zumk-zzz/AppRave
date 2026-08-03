import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, SectionHeader, Sheet, Text } from '@/src/components';
import { TIER_LABEL, TIER_TONE } from '@/src/lib/loyalty';
import { formatPhone } from '@/src/lib/phone';
import { useAuthStore } from '@/src/store/auth';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

export default function ProfileTab() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const orderCount = useOrdersStore((s) => s.orders.length);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const initial = user.name.trim().charAt(0).toUpperCase() || 'Г';

  return (
    <Screen scroll>
      <SectionHeader title="Профиль" kicker="Аккаунт" />

      <Card style={styles.identity}>
        <View style={styles.avatar}>
          <Text variant="title" tone="onAccent">
            {initial}
          </Text>
        </View>

        <View style={styles.identityText}>
          <Text variant="subtitle">{user.name}</Text>
          <Text variant="caption" tone="muted">
            {formatPhone(user.phone.replace(/^\+7/, ''))}
          </Text>
        </View>

        {isAdmin ? (
          <Badge label="Админ" tone="accent" />
        ) : (
          <Badge label={TIER_LABEL[user.tier]} tone={TIER_TONE[user.tier]} />
        )}
      </Card>

      {/* Уровень, баллы и номер карты показывают нули у администратора:
          он не покупает. Лишние пустые метрики только сбивают с толку. */}
      {!isAdmin && (
        <View style={styles.stats}>
          <Stat value={String(user.points)} label="Баллов" />
          <Stat value={user.memberNo} label="Карта" />
        </View>
      )}

      {/* Раздел существует только для админа: у гостя нет ни пункта меню,
          ни самого маршрута — он закрыт guard'ом в корневом layout */}
      {isAdmin && (
        <Card style={styles.adminCard} onPress={() => router.push('/admin')}>
          <View style={styles.adminIcon}>
            <Ionicons name="construct" size={20} color={colors.onAccent} />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Администрирование</Text>
            <Text variant="caption" tone="muted">
              Афиша, меню, склад, заказы
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>
      )}

      <View style={styles.menu}>
        {!isAdmin && (
          <Row
            icon="ticket-outline"
            label="Мои заказы"
            hint={orderCount > 0 ? String(orderCount) : undefined}
            onPress={() => router.push('/orders')}
          />
        )}
        <Row
          icon="notifications-outline"
          label="Уведомления"
          onPress={() => Alert.alert('Скоро', 'Настройки уведомлений появятся позже')}
        />
      </View>

      <Button
        label="Выйти"
        variant="outline"
        fullWidth
        onPress={() => setConfirmOpen(true)}
        style={styles.signOut}
      />

      <Text variant="caption" tone="faint" style={styles.version}>
        AppRave · демо-режим · оплата не настоящая
      </Text>

      <Sheet visible={confirmOpen} onClose={() => setConfirmOpen(false)} title="Выйти из аккаунта?">
        <Text variant="body" tone="muted" style={styles.confirmText}>
          Билеты и брони останутся за вами — просто войдите снова по этому же номеру.
        </Text>
        <View style={styles.confirmActions}>
          <Button
            label="Выйти"
            fullWidth
            size="lg"
            onPress={() => {
              setConfirmOpen(false);
              void signOut();
            }}
          />
          <Button
            label="Остаться"
            variant="ghost"
            fullWidth
            onPress={() => setConfirmOpen(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.stat}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </Card>
  );
}

function Row({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <Text variant="body" style={styles.rowLabel}>
        {label}
      </Text>
      {hint && (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  stat: {
    flex: 1,
    gap: spacing.xs,
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  adminIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  flex: {
    flex: 1,
  },
  menu: {
    marginTop: spacing.xxl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  rowLabel: {
    flex: 1,
  },
  signOut: {
    marginTop: spacing.xxl,
  },
  version: {
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  confirmText: {
    marginBottom: spacing.lg,
  },
  confirmActions: {
    gap: spacing.sm,
  },
});
