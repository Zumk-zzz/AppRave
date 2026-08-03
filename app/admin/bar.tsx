import { Screen, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';

export default function AdminBar() {
  return (
    <Screen>
      <AdminHeader title="Меню бара" subtitle="Этап D" />
      <Text variant="body" tone="muted">
        Редактирование меню появится на следующем этапе.
      </Text>
    </Screen>
  );
}
