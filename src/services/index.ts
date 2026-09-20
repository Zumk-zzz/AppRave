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
import { mockAuthService } from './auth.mock';
import { mockBarService } from './bar.mock';
import { mockBookingService } from './booking.mock';
import { mockEventsService } from './events.mock';
import { mockInventoryService } from './inventory.mock';
import { getDataSource } from './source';

const useApi = getDataSource() === 'api';

export const authService = useApi ? apiAuthService : mockAuthService;
export const eventsService = useApi ? apiEventsService : mockEventsService;
export const bookingService = useApi ? apiBookingService : mockBookingService;
export const barService = useApi ? apiBarService : mockBarService;

// Заказы, склад и админские операции пока только на моках. Их перенос
// на сервер — отдельный шаг: смешивать источники внутри одного заказа
// нельзя, иначе списания и остатки разойдутся между базой и телефоном.
export const inventoryService = mockInventoryService;
export const adminService = mockAdminService;

export { API_URL, ApiError, fetchMe, NetworkError, ping } from './api';
export { ADMIN_PHONE, DEMO_CODE, STAFF_PHONES } from './auth.mock';
export { getDataSource, setDataSource, type DataSource } from './source';
export * from './types';
