import AsyncStorage from '@react-native-async-storage/async-storage';

import { NetworkError } from './client';

/**
 * Снимок последнего успешного ответа.
 *
 * Нужен ровно для одного случая: в клубе нет связи, а гостю надо
 * показать QR на входе. Без кэша приложение офлайн показывает пустой
 * список, и билет, за который заплачено, оказывается недоступен —
 * притом что всё нужное телефон уже скачал час назад.
 *
 * Кэш подставляется только при отсутствии сети. Ошибка сервера или
 * отказ в правах через него не проходят: показывать старые данные
 * вместо «нет доступа» — значит врать.
 *
 * На отмену это не влияет: сканер на входе всё равно спрашивает сервер,
 * и старый код на экране гостя внутрь не пустит.
 */
const PREFIX = 'apprave.cache.';

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const fresh = await load();
    void write(key, fresh);
    return fresh;
  } catch (e) {
    if (e instanceof NetworkError) {
      const snapshot = await read<T>(key);
      if (snapshot !== null) return snapshot;
    }

    throw e;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Не сохранилось — просто не будет офлайн-копии
  }
}

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Забыть всё сохранённое.
 *
 * Вызывается при выходе: заказы принадлежат человеку, и следующий
 * владелец телефона не должен увидеть чужие билеты.
 */
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    // Не вышло — данные всё равно недоступны без токена
  }
}
