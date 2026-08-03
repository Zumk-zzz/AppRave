import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Chip, ChipRow, Screen, Text } from '@/src/components';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/src/data/bar';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatPrice } from '@/src/lib/format';
import type { BarCategory } from '@/src/services';
import { useCatalogStore } from '@/src/store/catalog';
import { colors, spacing } from '@/src/theme';

type Filter = 'all' | BarCategory;

export default function AdminBar() {
  const router = useRouter();
  const barMenu = useCatalogStore((s) => s.barMenu);
  const stock = useCatalogStore((s) => s.stock);

  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(
    () => (filter === 'all' ? barMenu : barMenu.filter((i) => i.category === filter)),
    [barMenu, filter],
  );

  return (
    <Screen scroll padded={false}>
      <View style={styles.padded}>
        <AdminHeader title="Меню бара" subtitle={`${barMenu.length} позиций`} />

        <Button
          label="Новая позиция"
          fullWidth
          icon={<Ionicons name="add" size={18} color={colors.onAccent} />}
          onPress={() => router.push({ pathname: '/admin/bar-item/[id]', params: { id: 'new' } })}
        />
      </View>

      <View style={styles.filters}>
        <ChipRow>
          <Chip label="Всё" selected={filter === 'all'} onPress={() => setFilter('all')} />
          {CATEGORY_ORDER.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_LABEL[c]}
              selected={filter === c}
              onPress={() => setFilter(c)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={[styles.padded, styles.list]}>
        {visible.map((item) => {
          const s = stock.find((x) => x.barItemId === item.id);
          const low = s ? s.qty <= s.lowThreshold : false;

          return (
            <Card
              key={item.id}
              onPress={() =>
                router.push({ pathname: '/admin/bar-item/[id]', params: { id: item.id } })
              }
              style={styles.card}
            >
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                    {item.name}
                  </Text>
                  {!item.available && <Badge label="Снято" tone="danger" />}
                </View>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {CATEGORY_LABEL[item.category]} · {item.volume} · {formatPrice(item.price)}
                </Text>
              </View>

              <View style={styles.stockBox}>
                <Text variant="bodyStrong" tone={low ? 'accent' : 'default'}>
                  {s?.qty ?? 0}
                </Text>
                <Text variant="caption" tone="faint">
                  {s?.unit ?? 'шт'}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  padded: {
    paddingHorizontal: spacing.lg,
  },
  filters: {
    marginTop: spacing.xl,
  },
  list: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stockBox: {
    alignItems: 'center',
    minWidth: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  flex: {
    flex: 1,
  },
});
