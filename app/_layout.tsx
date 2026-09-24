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

import { canNow } from '@/src/lib/permissions';
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
  const loadOrders = useOrdersStore((s) => s.load);
  const loadCatalog = useCatalogStore((s) => s.load);
  const loadStaff = useStaffStore((s) => s.load);
  const catalogLoaded = useCatalogStore((s) => s.loaded);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    // История заказов читается после входа: на сервере она принадлежит
    // конкретному человеку, и запрашивать её до авторизации бессмысленно.
    // Читается один раз — иначе экран билета и список заказов грузили бы
    // её каждый по отдельности и мигали.
    if (status !== 'authed') return;

    void loadOrders();
    // Баллы могли измениться без участия этого телефона: клуб вернул
    // деньги за отменённую вечеринку, заказ отменён с другого устройства
    void useAuthStore.getState().refresh();
  }, [status, loadOrders]);

  const userId = user?.id;

  useEffect(() => {
    // Смена, журнал и стоп-лист принадлежат конкретному сотруднику:
    // до входа запрашивать их не у кого. Следим за идентификатором,
    // а не за всем объектом: начисление баллов меняет его на каждой
    // покупке, и перечитывать журнал из-за этого незачем.
    void loadStaff(status === 'authed' ? (useAuthStore.getState().user ?? null) : null);
  }, [status, userId, loadStaff]);

  const staffRole = user?.staffRole;
  const onShift = useStaffStore((s) => !!s.shift);
  const may = (permission: Parameters<typeof canNow>[2]) => canNow(staffRole, onShift, permission);

  const seesStock = may('catalog:write') || may('stock:write');

  useEffect(() => {
    // Склад и схема зала нужны только тому, кто их правит, и сервер
    // остальным их не отдаст. Перечитываем, когда это меняется.
    void loadCatalog(seesStock);
  }, [seesStock, loadCatalog]);

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
  const canManage = isAuthed && may('catalog:write');
  const canBuy = isAuthed && may('purchase');
  // Экран смены доступен любому, у кого есть должность: на нём смену
  // и открывают, так что требовать открытой смены было бы замкнутым кругом.
  const hasPosition = isAuthed && !!staffRole;

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
