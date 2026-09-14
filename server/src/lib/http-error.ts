/** Ошибка с кодом ответа. Обработчик Fastify превращает её в JSON. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string, code?: string) => new HttpError(400, m, code);
export const unauthorized = (m = 'Требуется авторизация') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'Недостаточно прав') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Не найдено') => new HttpError(404, m, 'not_found');
/** 409 — состояние изменилось: билет разобрали, стол заняли. */
export const conflict = (m: string, code?: string) => new HttpError(409, m, code);
