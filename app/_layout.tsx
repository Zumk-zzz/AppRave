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

import { initNotifications } from '@/src/lib/reminders';
import { useAuthStore } from '@/src/store/auth';
import { useCatalogStore } from '@/src/store/catalog';
import { useOrdersStore } from '@/src/store/orders';
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
  const catalogLoaded = useCatalogStore((s) => s.loaded);

  useEffect(() => {
    void restore();
    // История заказов читается один раз на старте: экрану билета и списку
    // заказов иначе пришлось бы грузить её каждому по отдельности и мигать.
    void loadOrders();
    // Каталог должен быть в памяти раньше первого вызова сервиса — они
    // читают именно из него, а не из констант.
    void loadCatalog();
  }, [restore, loadOrders, loadCatalog]);

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
  const isAdmin = isAuthed && user?.role === 'admin';

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
        <Stack.Protected guard={isAuthed && !isAdmin}>
          <Stack.Screen name="checkout" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="orders" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ticket/[id]" options={{ animation: 'slide_from_bottom' }} />
        </Stack.Protected>

        {/* Маршруты админки недоступны гостю на уровне роутера, а не только
            спрятаны в интерфейсе: набрать /admin вручную не получится */}
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="admin" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
