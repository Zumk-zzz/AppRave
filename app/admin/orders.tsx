import { Screen, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';

export default function AdminOrders() {
  return (
    <Screen>
      <AdminHeader title="Заказы гостей" subtitle="Этап E" />
      <Text variant="body" tone="muted">
        Список продаж появится на следующем этапе.
      </Text>
    </Screen>
  );
}
