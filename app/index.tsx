import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  Screen,
  SectionHeader,
  Sheet,
  Stepper,
  Text,
} from '@/src/components';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { colors, radius, spacing } from '@/src/theme';

const FILTERS = ['Все', 'Techno', 'Hip-hop', 'House'] as const;

/**
 * Витрина дизайн-системы (шаг 2).
 * Нужна, чтобы оценить стиль на реальном экране до того, как на этих
 * компонентах будут построены все экраны. Удаляется на шаге 3.
 */
export default function Showcase() {
  const [filter, setFilter] = useState<string>('Все');
  const [qty, setQty] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 2);
  eventDate.setHours(23, 0, 0, 0);

  const handleFakePay = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1400);
  };

  return (
    <Screen scroll>
      <LinearGradient
        colors={['rgba(204,255,0,0.13)', 'rgba(204,255,0,0)']}
        style={styles.glow}
        pointerEvents="none"
      />

      <View style={styles.header}>
        <Text variant="label" tone="accent">
          Night club
        </Text>
        <Text variant="display">APPRAVE</Text>
        <Text variant="body" tone="muted">
          Дизайн-система · шаг 2 из 9
        </Text>
      </View>

      {/* Типографика */}
      <SectionHeader title="Типографика" kicker="Основа" />
      <Card style={styles.block}>
        <Text variant="title">Заголовок Unbounded</Text>
        <Text variant="subtitle" tone="muted">
          Подзаголовок
        </Text>
        <Text variant="body">
          Основной текст Inter. Проверяем кириллицу: съешь ещё этих мягких булок.
        </Text>
        <Text variant="caption" tone="faint">
          Вторичная подпись
        </Text>
      </Card>

      {/* Кнопки */}
      <SectionHeader title="Кнопки" kicker="Действия" />
      <View style={styles.block}>
        <Button label="Купить билет" onPress={handleFakePay} loading={loading} fullWidth size="lg" />
        <Button label="Забронировать стол" variant="surface" fullWidth />
        <Button label="Добавить к заказу" variant="outline" fullWidth />
        <Button label="Отменить" variant="ghost" fullWidth />
        <Button label="Недоступно" disabled fullWidth />
      </View>

      {/* Чипы */}
      <SectionHeader title="Фильтры" kicker="Выбор" />
      <View style={styles.chipsWrap}>
        <ChipRow paddingHorizontal={0}>
          {FILTERS.map((f) => (
            <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ChipRow>
      </View>

      {/* Карточка события */}
      <SectionHeader title="Карточка события" kicker="Афиша" />
      <Card style={styles.block} onPress={() => setSheetOpen(true)}>
        <View style={styles.rowBetween}>
          <Badge label="Осталось 12" tone="accent" />
          <Badge label="18+" tone="neutral" />
        </View>
        <Text variant="title">NEON RITUAL</Text>
        <Text variant="caption" tone="muted">
          {formatEventDate(eventDate)} · {pluralWithCount(3, 'диджей', 'диджея', 'диджеев')}
        </Text>
        <View style={styles.divider} />
        <View style={styles.rowBetween}>
          <View>
            <Text variant="caption" tone="faint">
              Вход от
            </Text>
            <Text variant="subtitle">{formatPrice(1500)}</Text>
          </View>
          <Button label="Подробнее" onPress={() => setSheetOpen(true)} />
        </View>
      </Card>

      {/* Метки */}
      <SectionHeader title="Метки" kicker="Статусы" />
      <View style={[styles.block, styles.badgeRow]}>
        <Badge label="Silver" tone="neutral" />
        <Badge label="Gold" tone="gold" />
        <Badge label="Black" tone="purple" />
        <Badge label="Оплачено" tone="success" />
        <Badge label="Отменено" tone="danger" />
      </View>

      {/* Счётчик */}
      <SectionHeader title="Счётчик" kicker="Бар" />
      <Card style={styles.block}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Негрони</Text>
            <Text variant="caption" tone="muted">
              {formatPrice(890)}
            </Text>
          </View>
          <Stepper value={qty} onChange={setQty} />
        </View>
        <View style={styles.divider} />
        <View style={styles.rowBetween}>
          <Text variant="caption" tone="muted">
            Итого
          </Text>
          <Text variant="subtitle" tone="accent">
            {formatPrice(890 * qty)}
          </Text>
        </View>
      </Card>

      <Button
        label="Открыть шторку"
        variant="surface"
        fullWidth
        onPress={() => setSheetOpen(true)}
        style={styles.lastButton}
      />

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Выберите билет">
        <View style={styles.sheetBody}>
          <Card elevated selected onPress={() => {}}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="bodyStrong">Standard</Text>
                <Text variant="caption" tone="muted">
                  Вход до 01:00
                </Text>
              </View>
              <Text variant="subtitle">{formatPrice(1500)}</Text>
            </View>
          </Card>
          <Card elevated onPress={() => {}}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="bodyStrong">VIP</Text>
                <Text variant="caption" tone="muted">
                  Отдельный вход и гардероб
                </Text>
              </View>
              <Text variant="subtitle">{formatPrice(4500)}</Text>
            </View>
          </Card>
          <Button label="Продолжить" fullWidth size="lg" onPress={() => setSheetOpen(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -200,
    left: -100,
    right: -100,
    height: 420,
    borderRadius: 210,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.xxl,
  },
  block: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  chipsWrap: {
    marginBottom: spacing.xxl,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  lastButton: {
    marginBottom: spacing.xl,
  },
  sheetBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
});
