import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CartBar } from '@/src/features/cart/CartBar';
import { useAuthStore } from '@/src/store/auth';
import { colors, fonts, fontSize } from '@/src/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: {
  name: string;
  title: string;
  icon: IoniconName;
  iconActive: IoniconName;
  /** Вкладка для гостя: у администратора нет ни карты, ни покупок */
  guestOnly?: boolean;
}[] = [
  { name: 'index', title: 'Афиша', icon: 'flash-outline', iconActive: 'flash' },
  { name: 'tables', title: 'Столики', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'bar', title: 'Бар', icon: 'wine-outline', iconActive: 'wine' },
  { name: 'card', title: 'Карта', icon: 'card-outline', iconActive: 'card', guestOnly: true },
  { name: 'profile', title: 'Профиль', icon: 'person-outline', iconActive: 'person' },
];

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <TabsNavigator />
      {/* Панель заказа общая для всех вкладок — иначе мигала бы на переходах */}
      <CartBar />
    </View>
  );
}

function TabsNavigator() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: fontSize.xs,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map(({ name, title, icon, iconActive, guestOnly }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            // Экран остаётся зарегистрированным, но пропадает из таб-бара:
            // убрать сам Tabs.Screen нельзя — expo-router ругается на файл
            // маршрута без объявления.
            href: guestOnly && isAdmin ? null : undefined,
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? iconActive : icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
