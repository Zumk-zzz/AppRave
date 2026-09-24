import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert } from 'react-native';

import { canCancel, CANCEL_BLOCK_TEXT, REFUND_CUTOFF_HOURS } from '@/src/lib/refund';
import type { Order } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { useOrdersStore } from '@/src/store/orders';

/**
 * Отмена заказа гостем — одинаково со всех экранов.
 *
 * Раньше отмена жила только внутри билета, и в списке заказов её не было
 * вовсе: чтобы отменить, нужно было догадаться открыть билет. Логика
 * подтверждения при этом должна остаться одна — две копии однажды
 * разойдутся в том, что именно обещают гостю.
 */
export function useCancelOrder() {
  const cancel = useOrdersStore((s) => s.cancel);
  const refreshUser = useAuthStore((s) => s.refresh);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const ask = (order: Order, onDone?: () => void) => {
    const check = canCancel(order);

    if (!check.allowed) {
      // Объясняем причину, а не прячем кнопку молча: гость должен
      // понимать, почему не получилось, и что делать дальше
      Alert.alert('Отмена недоступна', CANCEL_BLOCK_TEXT[check.reason ?? 'status']);
      return;
    }

    Alert.alert(
      'Отменить заказ?',
      `Билеты вернутся в продажу, напитки — на склад. Возврат придёт на карту в течение трёх дней.\n\n` +
        `Бесплатно до ${REFUND_CUTOFF_HOURS} часов до начала.`,
      [
        { text: 'Оставить', style: 'cancel' },
        {
          text: 'Отменить заказ',
          style: 'destructive',
          onPress: async () => {
            setCancelling(order.id);

            try {
              // Возврат товара делает сервис одной операцией: на сервере
              // это транзакция, повторять её на телефоне нельзя
              await cancel(order.id);
              // Баллы за отменённый заказ забирает сервер — показать
              // их дальше значило бы обещать то, чего уже нет
              await refreshUser();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onDone?.();
            } catch (e) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
            } finally {
              setCancelling(null);
            }
          },
        },
      ],
    );
  };

  return { ask, cancelling };
}
