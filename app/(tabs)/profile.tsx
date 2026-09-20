import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, SectionHeader, Sheet, Text, Toggle } from '@/src/components';
import { ContactsCard } from '@/src/features/profile/ContactsCard';
import { NotificationsRow } from '@/src/features/profile/NotificationsRow';
import { TIER_LABEL, TIER_TONE } from '@/src/lib/loyalty';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/src/lib/permissions';
import { formatContact } from '@/src/lib/contact';
import { useAuthStore, useCan, useStaffRole } from '@/src/store/auth';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

export default function ProfileTab() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const orderCount = useOrdersStore((s) => s.orders.length);
  const canBuy = useCan('purchase');
  const canManageCatalog = useCan('catalog:write');
  const canManageStaff = useCan('staff:manage');
  const staffRole = useStaffRole();
  const atWork = useAuthStore((s) => s.atWork);
  const setAtWork = useAuthStore((s) => s.setAtWork);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!user) return null;

  const contact = user.phone ? formatContact(user.phone) : (user.email ?? '');
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
            {contact}
          </Text>
        </View>

        {atWork && staffRole ? (
          <Badge label={ROLE_LABEL[staffRole]} tone="accent" />
        ) : (
          <Badge label={TIER_LABEL[user.tier]} tone={TIER_TONE[user.tier]} />
        )}
      </Card>

      {/* Уровень, баллы и номер карты показывают нули у персонала:
          оно не покупает. Лишние пустые метрики только сбивают с толку. */}
      {canBuy && (
        <View style={styles.stats}>
          <Stat value={String(user.points)} label="Баллов" />
          <Stat value={user.memberNo} label="Карта" />
        </View>
      )}

      {/* Переключатель разделяет «я на смене» и «я пришёл отдыхать».
          Без него сотрудник не смог бы ничего купить в свой выходной. */}
      {staffRole && (
        <Card style={styles.roleCard}>
          <Toggle
            label="Рабочий режим"
            hint={
              atWork
                ? ROLE_DESCRIPTION[staffRole]
                : `Выключен — вы обычный гость. Включите, когда выйдете на смену как ${ROLE_LABEL[staffRole].toLowerCase()}.`
            }
            value={atWork}
            onChange={(next) => void setAtWork(next)}
          />
        </Card>
      )}

      {/* Раздел управления виден по праву, а не по роли: и менеджер,
          и админ правят каталог, но роли ролями раздаёт только админ */}
      {canManageCatalog && (
        <Card style={styles.adminCard} onPress={() => router.push('/admin')}>
          <View style={styles.adminIcon}>
            <Ionicons name="construct" size={20} color={colors.onAccent} />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Управление</Text>
            <Text variant="caption" tone="muted">
              Афиша, меню, склад, заказы{canManageStaff ? ', сотрудники' : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>
      )}

      {staffRole && (
        <Card style={styles.adminCard} onPress={() => router.push('/shift')}>
          <View style={styles.adminIcon}>
            <Ionicons name="time" size={20} color={colors.onAccent} />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Смена и журнал</Text>
            <Text variant="caption" tone="muted">
              Открыть смену, посмотреть свои действия
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>
      )}

      <ContactsCard />

      <View style={styles.menu}>
        {canBuy && (
          <Row
            icon="ticket-outline"
            label="Мои заказы"
            hint={orderCount > 0 ? String(orderCount) : undefined}
            onPress={() => router.push('/orders')}
          />
        )}
        <NotificationsRow />
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
  roleCard: {
    marginTop: spacing.xl,
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
