import { Screen, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';

export default function AdminStock() {
  return (
    <Screen>
      <AdminHeader title="Склад" subtitle="Этап D" />
      <Text variant="body" tone="muted">
        Инвентаризация появится на следующем этапе.
      </Text>
    </Screen>
  );
}
