import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Field, Sheet, Text } from '@/src/components';
import { formatPrice, pluralWithCount } from '@/src/lib/format';
import { adminService, type ClubEvent, type RefundPreview } from '@/src/services';
import { useCan } from '@/src/store/auth';
import { colors, radius, spacing } from '@/src/theme';

interface Props {
  event: ClubEvent;
  /** Есть ли несохранённые правки: по ним возврат считать нельзя */
  dirty: boolean;
  onDone: () => void;
}

/**
 * Возврат денег за отменённую вечеринку.
 *
 * Единственная кнопка в приложении, которая двигает деньги обратно.
 * Защищена не окном «вы уверены?» — на него перестают смотреть через
 * неделю, — а условиями, которые нельзя выполнить мимоходом:
 *
 *  1. Раздел вообще не показывается, пока вечеринка не переведена
 *     в «Отменена» и сохранена. Это отдельное действие.
 *  2. Его не видит никто, кроме администратора: отменить вечеринку
 *     может и управляющий, вернуть за неё деньги — нет.
 *  3. Прежде чем нажать, видно точное число: сколько заказов, сколько
 *     гостей и какая сумма уйдёт обратно.
 *  4. Подтверждение — набрать название вечеринки слово в слово.
 *
 * Все четыре проверяются ещё раз на сервере: интерфейс защищает от
 * случайного нажатия, сервер — от всего остального.
 */
export function RefundSection({ event, dirty, onDone }: Props) {
  const canRefund = useCan('payments:refund');

  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);

  const cancelled = event.status === 'cancelled';

  const load = useCallback(async () => {
    try {
      setPreview(await adminService.refundPreview(event.id));
    } catch {
      // Предпросмотр не критичен: без него просто не покажем сумму
      setPreview(null);
    }
  }, [event.id]);

  const handleOpen = async () => {
    setConfirm('');
    await load();
    setOpen(true);
  };

  const handleRefund = async () => {
    setWorking(true);

    try {
      const result = await adminService.refundEvent(event.id, confirm);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOpen(false);

      Alert.alert(
        'Деньги возвращены',
        result.refunded === 0
          ? 'Возвращать было нечего — по этой вечеринке уже всё вернули.'
          : `${pluralWithCount(result.refunded, 'заказ', 'заказа', 'заказов')} на ${formatPrice(result.total)}. ` +
            'Гости увидят это в своих билетах.',
      );

      onDone();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Возврат не выполнен', e instanceof Error ? e.message : 'Попробуйте ещё раз');
    } finally {
      setWorking(false);
    }
  };

  // Раздел появляется только у отменённой вечеринки и только
  // у того, кто отвечает за деньги
  if (!canRefund || !cancelled) return null;

  const matches = confirm.trim() === event.title.trim();

  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="faint">
        Возврат денег
      </Text>

      <Card style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="cash-outline" size={20} color={colors.danger} />
          <Text variant="body" style={styles.flex}>
            Вечеринка отменена. Деньги гостям не возвращаются сами — это отдельное решение.
          </Text>
        </View>

        {dirty ? (
          <Text variant="caption" tone="faint">
            Сначала сохраните правки: возврат считается по тому, что записано.
          </Text>
        ) : (
          <Button label="Вернуть деньги гостям" variant="outline" fullWidth onPress={handleOpen} />
        )}
      </Card>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Вернуть деньги">
        <View style={styles.sheet}>
          {preview && (
            <View style={styles.summary}>
              <SummaryRow label="Заказов" value={String(preview.orders)} />
              <SummaryRow label="Гостей" value={String(preview.guests)} />
              <SummaryRow label="Сумма к возврату" value={formatPrice(preview.total)} strong />
            </View>
          )}

          {preview?.orders === 0 ? (
            <Text variant="body" tone="muted">
              По этой вечеринке возвращать нечего.
            </Text>
          ) : (
            <>
              <Text variant="caption" tone="muted">
                Деньги вернутся полностью, даже тем, кто успел получить напиток до отмены.
                Начисленные за покупку баллы спишутся. Отменить возврат нельзя.
              </Text>

              <Field
                label={`Наберите «${event.title}», чтобы подтвердить`}
                value={confirm}
                onChangeText={setConfirm}
                placeholder={event.title}
                autoCapitalize="characters"
              />

              <Button
                label={working ? 'Возвращаем…' : 'Вернуть деньги'}
                size="lg"
                fullWidth
                loading={working}
                disabled={!matches}
                onPress={handleRefund}
              />
            </>
          )}

          <Button label="Не возвращать" variant="ghost" fullWidth onPress={() => setOpen(false)} />
        </View>
      </Sheet>
    </View>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="body" tone="muted">
        {label}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'body'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  card: {
    gap: spacing.lg,
    borderColor: colors.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  sheet: {
    gap: spacing.lg,
  },
  summary: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
