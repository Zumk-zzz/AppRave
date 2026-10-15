import { Stack } from 'expo-router';

import { Platform, View, useWindowDimensions } from 'react-native';
import { DesktopNavigation } from '@/src/features/admin/DesktopNavigation';
import { colors, layout } from '@/src/theme';

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= layout.desktopBreakpoint;
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
    {desktop && <DesktopNavigation />}
    <View style={{ flex: 1 }}>
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    />
    </View></View>
  );
}
