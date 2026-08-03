import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, radius, spacing } from '@/src/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface CardProps extends ViewProps {
  /** Приподнятая поверхность — для модалок и выделенных блоков */
  elevated?: boolean;
  /** Лаймовая обводка: помечает выбранный вариант */
  selected?: boolean;
  /** Убрать внутренние отступы — нужно карточкам с картинкой во всю ширину */
  flush?: boolean;
  onPress?: () => void;
}

export function Card({
  elevated = false,
  selected = false,
  flush = false,
  onPress,
  style,
  children,
  ...rest
}: CardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const composed = [
    styles.base,
    elevated && styles.elevated,
    selected && styles.selected,
    !flush && styles.padded,
    style,
  ];

  if (!onPress) {
    return (
      <View style={composed} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withTiming(0.985, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 });
      }}
      style={[...composed, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.lg,
  },
  elevated: {
    backgroundColor: colors.surfaceElevated,
  },
  selected: {
    borderColor: colors.accent,
  },
});
