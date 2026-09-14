import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatPrice } from '@/src/lib/format';
import { adminService } from '@/src/services';
import { useCatalogStore } from '@/src/store/catalog';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

export default function AdminDashboard() {
  const router = useRouter();

  const events = useCatalogStore((s) => s.events);
  const barMenu = useCatalogStore((s) => s.barMenu);
  const stock = useCatalogStore((s) => s.stock);
  const orders = useOrdersStore((s) => s.orders);

  const [resetting, setResetting] = useState(false);

  const revenue = orders.reduce((sum, o) => sum + o.total, 0);
  const lowStock = stock.filter((s) => s.qty <= s.lowThreshold);

  const handleReset = () => {
    Alert.alert(
      'Сбросить каталог?',
      'Афиша, меню, столы и склад вернутся к демонстрационным данным. Все ваши правки пропадут.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            await adminService.resetCatalog();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setResetting(false);
          },
        },
      ],
    );
  };

  return (
    <Screen scroll>
      <AdminHeader title="Администрирование" subtitle="Управление клубом" />

      <View style={styles.metrics}>
        <Metric value={String(orders.length)} label="Заказов" />
        <Metric value={formatPrice(revenue)} label="Выручка" />
      </View>

      {lowStock.length > 0 && (
        <Card style={styles.alert}>
          <Ionicons name="warning-outline" size={20} color={colors.accent} />
          <Text variant="body" style={styles.flex}>
            Заканчивается {lowStock.length} позиций на складе
          </Text>
        </Card>
      )}

      <View style={styles.sections}>
        <Section
          icon="flash"
          title="Афиша"
          hint={`${events.length} вечеринок`}
          onPress={() => router.push('/admin/events')}
        />
        <Section
          icon="wine"
          title="Меню бара"
          hint={`${barMenu.length} позиций`}
          onPress={() => router.push('/admin/bar')}
        />
        <Section
          icon="cube"
          title="Склад"
          hint={lowStock.length > 0 ? `${lowStock.length} заканчивается` : 'Остатки в норме'}
          warn={lowStock.length > 0}
          onPress={() => router.push('/admin/stock')}
        />
        <Section
          icon="grid"
          title="Столы"
          hint="Вместимость и депозиты"
          onPress={() => router.push('/admin/tables')}
        />
        <Section
          icon="qr-code"
          title="Сканер на входе"
          hint="Проверка билетов по QR"
          onPress={() => router.push('/admin/scan')}
        />
        <Section
          icon="receipt"
          title="Заказы гостей"
          hint={`${orders.length} за всё время`}
          onPress={() => router.push('/admin/orders')}
        />
        <Section
          icon="stats-chart"
          title="Аналитика"
          hint="Выручка, средний чек, топ позиций"
          onPress={() => router.push('/admin/analytics')}
        />
      </View>

      {/* Без сброса удалённый каталог не восстановить иначе как
          переустановкой приложения */}
      <Button
        label={resetting ? 'Восстановление…' : 'Сбросить к демо-данным'}
        variant="outline"
        fullWidth
        loading={resetting}
        onPress={handleReset}
        style={styles.reset}
      />

      <Text variant="caption" tone="faint" style={styles.resetNote}>
        Вернёт афишу, меню, столы и склад в исходное состояние.{'\n'}
        Заказы гостей и баллы не тронет.
      </Text>
    </Screen>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.metric}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </Card>
  );
}

function Section({
  icon,
  title,
  hint,
  warn,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  hint: string;
  warn?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.section, pressed && styles.sectionPressed]}
    >
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>

      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone={warn ? 'accent' : 'faint'}>
          {hint}
        </Text>
      </View>

      {warn && <Badge label="!" tone="accent" />}
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metric: {
    flex: 1,
    gap: spacing.xs,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  sections: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sectionPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  flex: {
    flex: 1,
  },
  reset: {
    marginTop: spacing.xxl,
  },
  resetNote: {
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
