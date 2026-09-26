import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as NotificationsModule from 'expo-notifications';

import type { Order } from '@/src/services';

type Notifications = typeof NotificationsModule;

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

let loading: Promise<Notifications> | null = null;

/**
 * Загружает модуль уведомлений и настраивает его.
 *
 * Импорт отложенный, и это не оптимизация. Сам факт загрузки
 * expo-notifications в Expo Go печатает в консоль ошибку про удалённые
 * пуши: их там нет с SDK 53, а модуль при загрузке безусловно
 * подписывается на push-токен. Статический импорт делал это при каждом
 * запуске приложения, включая запуски, где до напоминаний дело не
 * дошло, — и красная ошибка встречала на экране входа.
 */
function notifications(): Promise<Notifications> {
  if (!loading) {
    loading = import('expo-notifications').then((mod) => {
      // Без обработчика уведомление не покажется поверх приложения
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });

      return mod;
    });
  }

  return loading;
}

/**
 * Подготовка при старте.
 *
 * Модуль поднимается, только если напоминания уже есть: иначе
 * сработавшее уведомление не покажется поверх открытого приложения.
 * Когда напоминаний нет, трогать его незачем.
 */
export async function initNotifications(): Promise<void> {
  const links = await readLinks();
  if (Object.keys(links).length === 0) return;

  await notifications();
}

export async function ensurePermission(): Promise<boolean> {
  const api = await notifications();

  const current = await api.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  const asked = await api.requestPermissionsAsync();
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
    const api = await notifications();

    return await api.scheduleNotificationAsync({
      content: {
        title: order.eventTitle ?? 'Сегодня в клубе',
        body: `Начало через ${REMIND_HOURS_BEFORE} часа. Билет — в приложении.`,
        data: { orderId: order.id },
      },
      trigger: {
        type: api.SchedulableTriggerInputTypes.DATE,
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
    const api = await notifications();
    await api.cancelScheduledNotificationAsync(id);
  } catch {
    // Уже сработало или снято — ничего страшного.
  }
}

/**
 * Связь «заказ → запланированное уведомление».
 *
 * Хранится на телефоне отдельно от заказа: уведомление поставлено этим
 * устройством, и на сервере, который отдаёт заказ и другим устройствам
 * того же человека, ему места нет.
 */
const LINK_KEY = 'apprave.reminders';

type Links = Record<string, string>;

async function readLinks(): Promise<Links> {
  try {
    const raw = await AsyncStorage.getItem(LINK_KEY);
    return raw ? (JSON.parse(raw) as Links) : {};
  } catch {
    return {};
  }
}

async function writeLinks(links: Links): Promise<void> {
  try {
    await AsyncStorage.setItem(LINK_KEY, JSON.stringify(links));
  } catch {
    // Напоминание останется висеть до своего срока — не критично
  }
}

/** Ставит напоминание по заказу и запоминает его, чтобы потом снять. */
export async function rememberReminder(order: Order): Promise<void> {
  const id = await scheduleReminder(order);
  if (!id) return;

  await writeLinks({ ...(await readLinks()), [order.id]: id });
}

/** Снимает напоминание по отменённому заказу. */
export async function forgetReminder(orderId: string): Promise<void> {
  const links = await readLinks();
  const id = links[orderId];
  if (!id) return;

  await cancelReminder(id);
  delete links[orderId];
  await writeLinks(links);
}
