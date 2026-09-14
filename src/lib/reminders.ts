import * as Notifications from 'expo-notifications';

import type { Order } from '@/src/services';

/** За сколько часов до начала приходит напоминание. */
export const REMIND_HOURS_BEFORE = 3;

/**
 * Локальные напоминания о вечеринке.
 *
 * Именно локальные, а не серверные пуши: удалённые уведомления, начиная
 * с SDK 53, в Expo Go не работают вообще и требуют dev build с платным
 * аккаунтом Apple. Локальные работают, и для напоминания «через три часа
 * ваша вечеринка» их достаточно — телефон и так знает время события.
 */

let handlerReady = false;

/** Вызывается один раз при старте: без обработчика уведомление не покажется поверх приложения. */
export function initNotifications() {
  if (handlerReady) return;
  handlerReady = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Ставит напоминание за REMIND_HOURS_BEFORE часов до начала.
 * Возвращает идентификатор, чтобы напоминание можно было снять при отмене заказа.
 */
export async function scheduleReminder(order: Order): Promise<string | null> {
  if (!order.eventDate) return null;

  const fireAt = new Date(
    new Date(order.eventDate).getTime() - REMIND_HOURS_BEFORE * 3_600_000,
  );

  // Момент уже прошёл — например, билет куплен за час до начала.
  // Планировать уведомление в прошлое нельзя, оно сработает немедленно.
  if (fireAt.getTime() <= Date.now()) return null;

  // Спрашиваем разрешение здесь, а не при первом запуске: просьба
  // понятна сразу после покупки и не выглядит навязчивой на старте.
  if (!(await ensurePermission())) return null;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: order.eventTitle ?? 'Сегодня в клубе',
        body: `Начало через ${REMIND_HOURS_BEFORE} часа. Билет — в приложении.`,
        data: { orderId: order.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {
    // Напоминание — приятное дополнение, а не часть покупки.
    // Его сбой не должен ломать оплату.
    return null;
  }
}

export async function cancelReminder(id: string | undefined) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Уже сработало или снято — ничего страшного.
  }
}
