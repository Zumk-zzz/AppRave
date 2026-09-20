import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CartBar } from '@/src/features/cart/CartBar';
import { canAny, type Permission } from '@/src/lib/permissions';
import { useAuthStore } from '@/src/store/auth';
import { colors, fonts, fontSize } from '@/src/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabDef {
  name: string;
  title: string;
  icon: IoniconName;
  iconActive: IoniconName;
  /**
   * Вкладка видна, если есть хотя бы одно из прав.
   * Пусто — видна всем.
   */
  needs?: Permission[];
}

/**
 * Полный набор вкладок. Каждая роль видит только свои — их четыре-пять,
 * а не восемь.
 *
 * Экраны остаются зарегистрированными и просто пропадают из таб-бара
 * через href: null. Убрать сам Tabs.Screen нельзя — expo-router требует
 * объявления для каждого существующего файла маршрута.
 */
const TABS: TabDef[] = [
  { name: 'index', title: 'Афиша', icon: 'flash-outline', iconActive: 'flash' },
  {
    name: 'scan',
    title: 'Сканер',
    icon: 'qr-code-outline',
    iconActive: 'qr-code',
    needs: ['scan:entry', 'scan:bar'],
  },
  { name: 'queue', title: 'Очередь', icon: 'list-outline', iconActive: 'list', needs: ['scan:bar'] },
  {
    name: 'guests',
    title: 'Гости',
    icon: 'people-outline',
    iconActive: 'people',
    needs: ['scan:entry'],
  },
  { name: 'tables', title: 'Столики', icon: 'grid-outline', iconActive: 'grid', needs: ['purchase'] },
  { name: 'bar', title: 'Бар', icon: 'wine-outline', iconActive: 'wine', needs: ['purchase'] },
  { name: 'card', title: 'Карта', icon: 'card-outline', iconActive: 'card', needs: ['purchase'] },
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
  const role = useAuthStore((s) => s.user?.role ?? 'guest');

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
      {TABS.map(({ name, title, icon, iconActive, needs }) => {
        const visible = !needs || canAny(role, needs);

        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title,
              href: visible ? undefined : null,
              tabBarIcon: ({ color, focused, size }) => (
                <Ionicons name={focused ? iconActive : icon} size={size} color={color} />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
