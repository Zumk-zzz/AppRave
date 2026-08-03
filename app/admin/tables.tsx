import { Screen, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';

export default function AdminTables() {
  return (
    <Screen>
      <AdminHeader title="Столы" subtitle="Этап E" />
      <Text variant="body" tone="muted">
        Редактирование столов появится на следующем этапе.
      </Text>
    </Screen>
  );
}
