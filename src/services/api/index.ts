import { InvalidCodeError } from '@/src/services/types';
import type {
  AuthService,
  BarService,
  BookingService,
  ClubEvent,
  EventsService,
  User,
} from '@/src/services/types';
import { cached } from './cache';
import { ApiError, request, setToken } from './client';
import {
  mapBarItem,
  mapEvent,
  mapTable,
  mapUser,
  type ApiBarItem,
  type ApiEvent,
  type ApiTable,
  type ApiUser,
} from './mappers';

export const apiAuthService: AuthService = {
  async requestCode(contact) {
    const res = await request<{ sentTo: string; channel: 'phone' | 'email' }>(
      '/auth/request-code',
      { method: 'POST', body: { contact }, anonymous: true },
    );
    return res;
  },

  async verifyCode(contact, code) {
    try {
      const res = await request<{ token: string; user: ApiUser }>('/auth/verify', {
        method: 'POST',
        body: { contact, code },
        anonymous: true,
      });

      await setToken(res.token);
      return mapUser(res.user);
    } catch (e) {
      // Экран отличает неверный код от сетевой ошибки и говорит разное
      if (e instanceof ApiError && e.code === 'invalid_code') throw new InvalidCodeError();
      throw e;
    }
  },

  async refresh() {
    return fetchMe();
  },

  async linkContact(_user, contact, code) {
    try {
      const res = await request<ApiUser>('/auth/link', {
        method: 'POST',
        body: { contact, code },
      });
      return mapUser(res);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'invalid_code') throw new InvalidCodeError();
      throw e;
    }
  },
};

export const apiEventsService: EventsService = {
  async list() {
    return cached('events', async () => {
      const events = await request<ApiEvent[]>('/events');
      return events.map(mapEvent);
    });
  },

  async byId(id) {
    try {
      return mapEvent(await request<ApiEvent>(`/events/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
};

export const apiBarService: BarService = {
  async menu() {
    return cached('bar-menu', async () => {
      const items = await request<ApiBarItem[]>('/bar/menu');
      return items.map(mapBarItem);
    });
  },
};

export const apiBookingService: BookingService = {
  async tablesFor(eventId) {
    const tables = await request<ApiTable[]>(`/events/${eventId}/tables`);
    return tables.map(mapTable);
  },
};

/** Текущий профиль с сервера: баллы и должность могли измениться. */
export async function fetchMe(): Promise<User> {
  return mapUser(await request<ApiUser>('/auth/me'));
}

export {
  API_URL,
  ApiError,
  isOffline,
  NetworkError,
  ping,
  setToken,
  watchConnection,
} from './client';
export type { ClubEvent };
