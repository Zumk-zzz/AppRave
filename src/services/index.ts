/**
 * Точка входа к данным.
 *
 * Экраны импортируют сервисы только отсюда и не знают, откуда берутся
 * данные. Подключение бэкенда = замена правой части этих присваиваний.
 */
import { mockAuthService } from './auth.mock';
import { mockBookingService } from './booking.mock';
import { mockEventsService } from './events.mock';

export const authService = mockAuthService;
export const eventsService = mockEventsService;
export const bookingService = mockBookingService;

export { DEMO_CODE } from './auth.mock';
export * from './types';
