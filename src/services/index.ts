/**
 * Точка входа к данным.
 *
 * Экраны импортируют сервисы только отсюда и не знают, откуда берутся
 * данные. Подключение бэкенда = замена правой части этих присваиваний.
 */
import { mockAdminService } from './admin.mock';
import { mockAuthService } from './auth.mock';
import { mockBarService } from './bar.mock';
import { mockBookingService } from './booking.mock';
import { mockEventsService } from './events.mock';
import { mockInventoryService } from './inventory.mock';

export const authService = mockAuthService;
export const eventsService = mockEventsService;
export const bookingService = mockBookingService;
export const barService = mockBarService;
export const inventoryService = mockInventoryService;
export const adminService = mockAdminService;

export { ADMIN_PHONE, DEMO_CODE, STAFF_PHONES } from './auth.mock';
export * from './types';
