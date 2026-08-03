import { Screen, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';

export default function AdminEvents() {
  return (
    <Screen>
      <AdminHeader title="Афиша" subtitle="Этап C" />
      <Text variant="body" tone="muted">
        Управление вечеринками появится на следующем этапе.
      </Text>
    </Screen>
  );
}
