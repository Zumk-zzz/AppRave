import { z } from 'zod';
import { conflict } from './http-error.js';

// Только официальные тестовые шлюзы. Продакшен включается отдельной доработкой
// после согласования договора, налоговых реквизитов, чеков и возвратов.
export const ALFA_TEST_URLS = ['https://alfa.rbsuat.com/payment/rest/', 'https://tws.egopay.ru/api/ab/rest/'] as const;
type Options = { baseUrl: typeof ALFA_TEST_URLS[number]; userName: string; password: string; returnBaseUrl: string; callbackUrl?: string };
export function alfaClient(options: Options, transport: typeof fetch = fetch) {
  if (!ALFA_TEST_URLS.includes(options.baseUrl)) throw new Error('Only Alfa sandbox endpoints are supported');
  const call = async (method: string, values: Record<string, string>) => {
    const body = new URLSearchParams({ userName: options.userName, password: options.password, ...values });
    let response: Response;
    try { response = await transport(options.baseUrl + method, { method: 'POST', body, signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw conflict('Банк не ответил. Не создавайте повторную оплату, проверьте состояние заказа', 'bank_unavailable'); }
    if (!response.ok) throw conflict('Платёжный шлюз временно недоступен', 'bank_unavailable');
    const data = z.record(z.unknown()).parse(await response.json());
    if (data.errorCode !== undefined && String(data.errorCode) !== '0') throw conflict('Банк не принял запрос. Проверьте настройки тестового кабинета', 'bank_rejected');
    return data;
  };
  return {
    async register(input: { id: string; number: string; amountKopecks: number; email: string; expiresAt: Date }) {
      const seconds = Math.floor((input.expiresAt.getTime() - Date.now()) / 1000);
      if (seconds < 1) throw conflict('Время резерва истекло', 'reservation_expired');
      const returnUrl = new URL(`/payment/${encodeURIComponent(input.id)}`, options.returnBaseUrl).toString();
      const data = await call('register.do', { orderNumber: input.id, amount: String(input.amountKopecks), currency: '643', returnUrl,
        failUrl: returnUrl, description: `AppRave ${input.number}`, language: 'ru', sessionTimeoutSecs: String(seconds),
        jsonParams: JSON.stringify({ email: input.email }), ...(options.callbackUrl ? { dynamicCallbackUrl: options.callbackUrl } : {}) });
      const result = z.object({ orderId: z.string().min(1), formUrl: z.string().url() }).parse(data);
      const url = new URL(result.formUrl);
      if (url.protocol !== 'https:' || !['alfa.rbsuat.com', 'tws.egopay.ru'].includes(url.hostname)) throw conflict('Банк вернул неизвестный адрес оплаты', 'invalid_bank_url');
      return { providerId: result.orderId, confirmationUrl: result.formUrl };
    },
    async status(providerId: string, expected: { id: string; amountKopecks: number }) {
      const data = await call('getOrderStatusExtended.do', { orderId: providerId });
      if (data.orderNumber !== expected.id || Number(data.amount) !== expected.amountKopecks || String(data.currency) !== '643') {
        throw conflict('Данные платежа не совпали с заказом', 'payment_mismatch');
      }
      const state = Number(data.orderStatus);
      if (!Number.isInteger(state) || state < 0 || state > 6) throw conflict('Неизвестное состояние платежа', 'unknown_bank_status');
      return { paid: state === 2, failed: [3, 6].includes(state), refunded: state === 4, bankStatus: state };
    },
  };
}
