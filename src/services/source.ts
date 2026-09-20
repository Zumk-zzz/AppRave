import Constants from 'expo-constants';

export type DataSource = 'mock' | 'api';

/**
 * Откуда приложение берёт данные.
 *
 * Значение читается один раз при старте и на лету не меняется: экраны
 * уже держат загруженные данные, и переключение посреди работы оставило
 * бы половину приложения на одном источнике, половину на другом.
 *
 * По умолчанию моки — приложение должно запускаться и работать без
 * поднятого сервера. Переключается в app.json: extra.dataSource.
 */
let current: DataSource =
  Constants.expoConfig?.extra?.dataSource === 'api' ? 'api' : 'mock';

export function getDataSource(): DataSource {
  return current;
}

/**
 * Меняет источник. Вступает в силу только после перезапуска приложения:
 * модули сервисов уже разобраны по экранам.
 */
export function setDataSource(next: DataSource) {
  current = next;
}
