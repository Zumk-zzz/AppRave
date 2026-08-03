import { Stack } from 'expo-router';

import { colors } from '@/src/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        // Слайд подчёркивает, что вход — это последовательность шагов
        animation: 'slide_from_right',
      }}
    />
  );
}
