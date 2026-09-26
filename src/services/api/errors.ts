/**
 * Ошибки сетевого слоя.
 *
 * Вынесены из client отдельно, потому что нужны и ему, и кэшу: кэш
 * отдаёт сохранённую копию только при NetworkError, а клиент при выходе
 * из аккаунта просит кэш очиститься. Пока классы жили в client, эти
 * двое ссылались друг на друга, и Metro справедливо предупреждал про
 * цикл — при неудачном порядке загрузки один из модулей увидел бы
 * вместо класса пустоту.
 */

/** Ошибка от API с кодом, по которому экран может отличить причину. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Сеть недоступна: сервер не запущен или телефон в другой сети. */
export class NetworkError extends Error {
  constructor() {
    super('Сервер недоступен');
    this.name = 'NetworkError';
  }
}
