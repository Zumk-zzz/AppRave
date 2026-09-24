import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Unbounded_500Medium } from '@expo-google-fonts/unbounded/500Medium';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { can, effectiveRole } from '@/src/lib/permissions';
import { initNotifications } from '@/src/lib/reminders';
import { useAuthStore } from '@/src/store/auth';
import { useCatalogStore } from '@/src/store/catalog';
import { useOrdersStore } from '@/src/store/orders';
import { useStaffStore } from '@/src/store/staff';
import { colors } from '@/src/theme';

// Держим сплэш до загрузки шрифтов, иначе на старте мелькает системный шрифт.
SplashScreen.preventAutoHideAsync();

// Без обработчика уведомление не покажется, пока приложение открыто.
initNotifications();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Unbounded_500Medium,
    Unbounded_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const user = useAuthStore((s) => s.user);
  const atWork = useAuthStore((s) => s.atWork);
  const loadOrders = useOrdersStore((s) => s.load);
  const loadCatalog = useCatalogStore((s) => s.load);
  const loadStaff = useStaffStore((s) => s.load);
  const catalogLoaded = useCatalogStore((s) => s.loaded);

  useEffect(() => {
    void restore();
    void loadStaff();
  }, [restore, loadStaff]);

  useEffect(() => {
    // История заказов читается после входа: на сервере она принадлежит
    // конкретному человеку, и запрашивать её до авторизации бессмысленно.
    // Читается один раз — иначе экран билета и список заказов грузили бы
    // её каждый по отдельности и мигали.
    if (status === 'authed') void loadOrders();
  }, [status, loadOrders]);

  const role = effectiveRole(user?.staffRole, atWork);

  useEffect(() => {
    // Каталог перечитывается при смене действующей роли: сотрудник,
    // вставший на смену, должен увидеть склад и схему зала, а гостю
    // они не положены — сервер их ему и не отдаст.
    void loadCatalog(can(role, 'catalog:write') || can(role, 'stock:write'));
  }, [role, loadCatalog]);

  const fontsReady = fontsLoaded || fontError;
  const authReady = status !== 'loading';

  useEffect(() => {
    // Прячем сплэш и при ошибке шрифтов тоже — иначе приложение навсегда
    // останется на заставке. Системный шрифт лучше чёрного экрана.
    if (fontsReady && authReady && catalogLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady, authReady, catalogLoaded]);

  if (!fontsReady || !authReady || !catalogLoaded) {
    return null;
  }

  const isAuthed = status === 'authed';

  // Маршруты закрываются по правам, а не по названию роли: менеджер
  // и админ попадают в управление одинаково, но раздел сотрудников
  // открыт только тому, у кого есть staff:manage.
  const canManage = isAuthed && can(role, 'catalog:write');
  const canBuy = isAuthed && can(role, 'purchase');
  // Смена доступна любому, у кого есть должность, даже вне рабочего режима:
  // иначе её нечем было бы открыть.
  const hasPosition = isAuthed && !!user?.staffRole;

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        {/* Роутер сам перебросит между группами, когда guard изменится */}
        <Stack.Protected guard={!isAuthed}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={isAuthed}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>

        {/* Покупки и билеты — только для гостя. Администратор сотрудник,
            а не клиент, и закрыто это на уровне роутера, а не только
            спрятанными кнопками. */}
        <Stack.Protected guard={canBuy}>
          <Stack.Screen name="checkout" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="orders" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ticket/[id]" options={{ animation: 'slide_from_bottom' }} />
        </Stack.Protected>

        {/* Смена и журнал — для любого сотрудника, независимо от роли */}
        <Stack.Protected guard={hasPosition}>
          <Stack.Screen name="shift" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>

        {/* Маршруты админки недоступны гостю на уровне роутера, а не только
            спрятаны в интерфейсе: набрать /admin вручную не получится */}
        <Stack.Protected guard={canManage}>
          <Stack.Screen name="admin" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
