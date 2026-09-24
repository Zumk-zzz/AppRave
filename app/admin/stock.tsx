import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Field,
  NumberField,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
  Text,
} from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { deltaFor, isLowStock, MANUAL_MOVE_KINDS, MOVE_LABEL, MOVE_TONE } from '@/src/lib/inventory';
import type { BarItem, StockAdjustKind, StockItem } from '@/src/services';
import { useCatalogStore } from '@/src/store/catalog';
import { colors, spacing } from '@/src/theme';

export default function AdminStock() {
  const barMenu = useCatalogStore((s) => s.barMenu);
  const stock = useCatalogStore((s) => s.stock);
  const moves = useCatalogStore((s) => s.moves);
  const applyStockMove = useCatalogStore((s) => s.applyStockMove);

  const [editing, setEditing] = useState<{ item: BarItem; stock: StockItem } | null>(null);
  const [kind, setKind] = useState<StockAdjustKind>('receipt');
  const [amount, setAmount] = useState(0);
  const [comment, setComment] = useState('');
  const [applying, setApplying] = useState(false);

  const low = stock.filter(isLowStock);
  const nameOf = (barItemId: string) =>
    barMenu.find((i) => i.id === barItemId)?.name ?? 'Удалённая позиция';

  const openEditor = (item: BarItem, s: StockItem) => {
    setEditing({ item, stock: s });
    setKind('receipt');
    setAmount(0);
    setComment('');
  };

  const handleApply = async () => {
    if (!editing || amount === 0) return;

    const delta = deltaFor(kind, amount, editing.stock.qty);
    if (delta === 0) {
      setEditing(null);
      return;
    }

    setApplying(true);
    try {
      await applyStockMove({
        barItemId: editing.item.id,
        kind,
        delta,
        comment: comment.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(null);
    } catch (e) {
      // Списать больше, чем есть, сервер не даст — и правильно сделает
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Screen scroll>
      <AdminHeader title="Склад" subtitle={`${stock.length} позиций`} />

      {low.length > 0 && (
        <Card style={styles.alert}>
          <Ionicons name="warning-outline" size={20} color={colors.accent} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Заканчивается {low.length} позиций</Text>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {low.map((s) => nameOf(s.barItemId)).join(', ')}
            </Text>
          </View>
        </Card>
      )}

      <SectionHeader title="Остатки" kicker="Наличие" spaced />
      <View style={styles.list}>
        {stock.map((s) => {
          const item = barMenu.find((i) => i.id === s.barItemId);
          if (!item) return null;

          return (
            <Card key={s.barItemId} onPress={() => openEditor(item, s)} style={styles.row}>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption" tone="faint">
                  Порог {s.lowThreshold} {s.unit}
                </Text>
              </View>

              {isLowStock(s) && <Badge label="Мало" tone="accent" />}

              <View style={styles.qtyBox}>
                <Text variant="subtitle" tone={isLowStock(s) ? 'accent' : 'default'}>
                  {s.qty}
                </Text>
                <Text variant="caption" tone="faint">
                  {s.unit}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>

      <SectionHeader title="Журнал" kicker="История движений" spaced />
      {moves.length === 0 ? (
        <Text variant="caption" tone="faint" style={styles.empty}>
          Движений пока не было. Приходы, списания и продажи появятся здесь.
        </Text>
      ) : (
        <View style={styles.list}>
          {moves.slice(0, 40).map((move) => (
            <Card key={move.id} style={styles.moveRow}>
              <View style={styles.flex}>
                <Text variant="body" numberOfLines={1}>
                  {nameOf(move.barItemId)}
                </Text>
                <Text variant="caption" tone="faint">
                  {format(new Date(move.createdAt), 'd MMM, HH:mm', { locale: ru })}
                  {move.comment ? ` · ${move.comment}` : ''}
                  {move.orderId ? ` · ${move.orderId}` : ''}
                </Text>
              </View>

              <Badge label={MOVE_LABEL[move.kind]} tone={MOVE_TONE[move.kind]} />

              <Text variant="bodyStrong" tone={move.delta > 0 ? 'success' : 'danger'}>
                {move.delta > 0 ? '+' : ''}
                {move.delta}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.item.name ?? ''}
      >
        {editing && (
          <View style={styles.sheet}>
            <Text variant="caption" tone="muted">
              Сейчас на складе {editing.stock.qty} {editing.stock.unit}
            </Text>

            <Segmented
              options={MANUAL_MOVE_KINDS.map((k) => ({ value: k, label: MOVE_LABEL[k] }))}
              value={kind}
              onChange={(next) => {
                setKind(next);
                setAmount(0);
              }}
            />

            <NumberField
              label={kind === 'correction' ? 'Фактический остаток' : 'Количество'}
              value={amount}
              onChangeValue={setAmount}
              suffix={editing.stock.unit}
              hint={
                kind === 'correction'
                  ? 'Пересчитали вручную — укажите, сколько реально есть'
                  : undefined
              }
            />

            <Field
              label="Комментарий"
              value={comment}
              onChangeText={setComment}
              placeholder={kind === 'writeoff' ? 'Бой, порча' : 'Поставка от…'}
            />

            <Button
              label="Провести"
              size="lg"
              fullWidth
              loading={applying}
              disabled={amount === 0 && kind !== 'correction'}
              onPress={handleApply}
            />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  qtyBox: {
    alignItems: 'flex-end',
    minWidth: 44,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  empty: {
    marginBottom: spacing.xl,
  },
  sheet: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
