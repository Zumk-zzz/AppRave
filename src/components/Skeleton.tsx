import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '@/src/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Скругление: по умолчанию как у мелких элементов */
  round?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Пульсирующая заглушка на время загрузки.
 * Показывает будущую структуру экрана вместо крутящегося кружка —
 * ожидание ощущается короче, когда видно, что именно грузится.
 */
export function Skeleton({ width = '100%', height = 16, round = radius.sm, style }: SkeletonProps) {
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[styles.base, { width, height, borderRadius: round }, animatedStyle, style]}
    />
  );
}

/** Группа заглушек с равными отступами. */
export function SkeletonGroup({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ gap }}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceElevated,
  },
});
