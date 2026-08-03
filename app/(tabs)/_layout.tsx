import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CartBar } from '@/src/features/cart/CartBar';
import { colors, fonts, fontSize } from '@/src/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IoniconName; iconActive: IoniconName }[] = [
  { name: 'index', title: 'Афиша', icon: 'flash-outline', iconActive: 'flash' },
  { name: 'tables', title: 'Столики', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'bar', title: 'Бар', icon: 'wine-outline', iconActive: 'wine' },
  { name: 'card', title: 'Карта', icon: 'card-outline', iconActive: 'card' },
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
      {TABS.map(({ name, title, icon, iconActive }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
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
