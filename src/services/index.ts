/**
 * Точка входа к данным.
 *
 * Экраны импортируют сервисы только отсюда и не знают, откуда берутся
 * данные — из моков или из API. Ради этого всё и строилось: приложение
 * написано целиком до появления сервера, а подключение не потребовало
 * править ни один экран.
 */
import { mockAdminService } from './admin.mock';
import { apiAuthService, apiBarService, apiBookingService, apiEventsService } from './api';
import { apiAdminService, apiInventoryService } from './api/admin';
import { apiOrdersService } from './api/orders';
import { apiStaffService } from './api/staff';
import { mockAuthService } from './auth.mock';
import { mockBarService } from './bar.mock';
import { mockBookingService } from './booking.mock';
import { mockEventsService } from './events.mock';
import { mockInventoryService } from './inventory.mock';
import { mockOrdersService } from './orders.mock';
import { mockStaffService } from './staff.mock';
import { getDataSource } from './source';

const useApi = getDataSource() === 'api';

export const authService = useApi ? apiAuthService : mockAuthService;
export const eventsService = useApi ? apiEventsService : mockEventsService;
export const bookingService = useApi ? apiBookingService : mockBookingService;
export const barService = useApi ? apiBarService : mockBarService;
export const ordersService = useApi ? apiOrdersService : mockOrdersService;
export const inventoryService = useApi ? apiInventoryService : mockInventoryService;
export const adminService = useApi ? apiAdminService : mockAdminService;
export const staffService = useApi ? apiStaffService : mockStaffService;

export { API_URL, ApiError, fetchMe, NetworkError, ping, setToken } from './api';
export { ADMIN_PHONE, DEMO_CODE, STAFF_PHONES } from './auth.mock';
export { getDataSource, setDataSource, type DataSource } from './source';
export * from './types';
