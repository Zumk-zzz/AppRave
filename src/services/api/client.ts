import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { clearCache } from './cache';

const TOKEN_KEY = 'apprave.token';

/**
 * Адрес API выводится из адреса Metro.
 *
 * Сервер поднимается на той же машине, что и сборщик, поэтому хост берём
 * оттуда, а порт подставляем свой. Иначе пришлось бы вписывать IP руками
 * в конфиг и править его при каждой смене сети — на телефоне localhost
 * означает сам телефон, а не компьютер разработчика.
 */
function resolveBaseUrl(): string {
  const configured = Constants.expoConfig?.extra?.apiUrl;
  if (typeof configured === 'string' && configured.length > 0) return configured;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];

  return host ? `http://${host}:3000` : 'http://localhost:3000';
}

export const API_URL = resolveBaseUrl();

let token: string | null = null;

/**
 * Была ли связь на последнем запросе.
 *
 * Экраны показывают по нему плашку «нет связи»: пустой список без
 * объяснения выглядит как потерянные билеты. Отдельный опрос сервера
 * ради этого не нужен — ответ уже известен из последнего обращения.
 */
let online = true;
const watchers = new Set<() => void>();

function setOnline(next: boolean) {
  if (online === next) return;
  online = next;
  for (const notify of watchers) notify();
}

export function isOffline(): boolean {
  return !online;
}

/** Подписка для экранов: плашка «нет связи» должна появляться сама. */
export function watchConnection(notify: () => void): () => void {
  watchers.add(notify);
  return () => watchers.delete(notify);
}

export async function loadToken(): Promise<string | null> {
  if (token) return token;
  try {
    token = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

export async function setToken(next: string | null) {
  token = next;
  try {
    if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Токен не сохранился — пользователь войдёт заново при перезапуске
  }

  // Вышли — стираем офлайн-копии: следующий владелец телефона
  // не должен увидеть чужие билеты
  if (!next) await clearCache();
}

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

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Ключ идемпотентности для создающих запросов */
  idempotencyKey?: string;
  /** Не подставлять токен — для входа */
  anonymous?: boolean;
}

const TIMEOUT_MS = 10_000;

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, anonymous } = options;

  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (!anonymous) {
    const auth = await loadToken();
    if (auth) headers.authorization = `Bearer ${auth}`;
  }

  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  // Без таймаута зависший запрос держит экран в загрузке бесконечно:
  // на телефоне в чужой сети это обычное дело.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    setOnline(false);
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  setOnline(true);

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? `Ошибка запроса (${response.status})`;
    const code = (payload as { code?: string } | null)?.code;

    // Токен протух — чистим, иначе каждый следующий запрос будет падать
    if (response.status === 401) await setToken(null);

    throw new ApiError(response.status, message, code);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Проверка, что сервер отвечает. Используется экраном настроек. */
export async function ping(): Promise<boolean> {
  try {
    await request<{ ok: boolean }>('/health', { anonymous: true });
    return true;
  } catch {
    return false;
  }
}
