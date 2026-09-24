import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Screen, SectionHeader, Segmented, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import {
  averageCheck,
  cancelRate,
  revenueByDay,
  topLines,
  totalRevenue,
  type DayBucket,
} from '@/src/lib/analytics';
import { formatPrice, pluralWithCount } from '@/src/lib/format';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

type Period = '7' | '30';

export default function AdminAnalytics() {
  const orders = useOrdersStore((s) => s.staffOrders);
  const loadStaff = useOrdersStore((s) => s.loadStaff);
  const [period, setPeriod] = useState<Period>('7');

  useFocusEffect(
    useCallback(() => {
      void loadStaff();
    }, [loadStaff]),
  );

  const days = Number(period);
  const buckets = useMemo(() => revenueByDay(orders, days), [orders, days]);

  const periodRevenue = buckets.reduce((sum, b) => sum + b.revenue, 0);
  const periodOrders = buckets.reduce((sum, b) => sum + b.orders, 0);

  const topBar = useMemo(() => topLines(orders, 'bar'), [orders]);
  const topTickets = useMemo(() => topLines(orders, 'ticket'), [orders]);

  return (
    <Screen scroll>
      <AdminHeader title="Аналитика" subtitle="Продажи и спрос" />

      <View style={styles.period}>
        <Segmented
          options={[
            { value: '7', label: '7 дней' },
            { value: '30', label: '30 дней' },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </View>

      <View style={styles.metrics}>
        <Metric value={formatPrice(periodRevenue)} label={`Выручка за ${days} дней`} />
        <Metric value={String(periodOrders)} label="Заказов" />
      </View>
      <View style={styles.metrics}>
        <Metric value={formatPrice(averageCheck(orders))} label="Средний чек" />
        <Metric value={`${cancelRate(orders)}%`} label="Отмен" />
      </View>

      <SectionHeader title="Выручка по дням" kicker="Динамика" />
      <Card style={styles.chartCard}>
        <Chart buckets={buckets} />
      </Card>

      <SectionHeader title="Топ бара" kicker="По выручке" />
      <TopList
        entries={topBar}
        empty="Напитки пока не заказывали"
        unit={['порция', 'порции', 'порций']}
      />

      <SectionHeader title="Топ билетов" kicker="По выручке" />
      <TopList
        entries={topTickets}
        empty="Билеты пока не покупали"
        unit={['билет', 'билета', 'билетов']}
      />

      <Text variant="caption" tone="faint" style={styles.note}>
        Отменённые заказы в расчёты не входят — деньги вернулись гостю.
      </Text>
    </Screen>
  );
}

/**
 * Столбчатый график на View.
 * Библиотека графиков ради одного экрана утяжелила бы бандл сильнее,
 * чем стоит эта картинка.
 */
function Chart({ buckets }: { buckets: DayBucket[] }) {
  const max = Math.max(...buckets.map((b) => b.revenue), 1);
  // Подписываем не каждый столбец: на тридцати днях они сольются
  const labelEvery = buckets.length > 10 ? Math.ceil(buckets.length / 5) : 1;

  return (
    <View>
      <View style={styles.chart}>
        {buckets.map((bucket, i) => (
          <View key={bucket.date} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  // Минимум 2px, иначе пустой день выглядит как отсутствующий
                  height: Math.max(2, (bucket.revenue / max) * 120),
                  backgroundColor: bucket.revenue > 0 ? colors.accent : colors.border,
                },
              ]}
            />
            {i % labelEvery === 0 && (
              <Text variant="caption" tone="faint" style={styles.barLabel}>
                {format(new Date(bucket.date), 'd MMM', { locale: ru })}
              </Text>
            )}
          </View>
        ))}
      </View>

      <Text variant="caption" tone="faint" style={styles.chartMax}>
        Максимум за день: {formatPrice(max)}
      </Text>
    </View>
  );
}

function TopList({
  entries,
  empty,
  unit,
}: {
  entries: { title: string; qty: number; revenue: number }[];
  empty: string;
  unit: [string, string, string];
}) {
  if (entries.length === 0) {
    return (
      <Text variant="caption" tone="faint" style={styles.empty}>
        {empty}
      </Text>
    );
  }

  const max = Math.max(...entries.map((e) => e.revenue), 1);

  return (
    <View style={styles.top}>
      {entries.map((entry) => (
        <Card key={entry.title} style={styles.topRow}>
          <View style={styles.topHead}>
            <Text variant="body" style={styles.flex} numberOfLines={1}>
              {entry.title}
            </Text>
            <Text variant="bodyStrong">{formatPrice(entry.revenue)}</Text>
          </View>

          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(entry.revenue / max) * 100}%` }]} />
          </View>

          <Text variant="caption" tone="faint">
            {pluralWithCount(entry.qty, ...unit)}
          </Text>
        </Card>
      ))}
    </View>
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

const styles = StyleSheet.create({
  period: {
    marginBottom: spacing.lg,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metric: {
    flex: 1,
    gap: spacing.xs,
  },
  chartCard: {
    gap: spacing.md,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 150,
  },
  barSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  bar: {
    width: '100%',
    borderRadius: 3,
  },
  barLabel: {
    fontSize: 9,
  },
  chartMax: {
    textAlign: 'right',
  },
  top: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  topRow: {
    gap: spacing.sm,
  },
  topHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  empty: {
    marginBottom: spacing.lg,
  },
  note: {
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});
