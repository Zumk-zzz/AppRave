import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, fonts, fontSize, glow, radius, spacing } from '@/src/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant =
  /** Главное действие на экране. Лаймовая заливка, чёрный текст. */
  | 'accent'
  /** Второстепенное действие на тёмной поверхности */
  | 'surface'
  /** Третьестепенное: только обводка */
  | 'outline'
  /** Без фона — для ссылок и отмены */
  | 'ghost';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Иконка слева от текста */
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'accent',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  style,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const inert = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 90 });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 120 });
  };

  const handlePress = () => {
    // Тактильный отклик заметно поднимает ощущение качества на iOS
    // и стоит одну строку.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.base,
        styles[size],
        variantStyles[variant],
        variant === 'accent' && !inert && glow.accent,
        fullWidth && styles.fullWidth,
        inert && styles.inert,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={labelColor[variant]} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Animated.Text
            numberOfLines={1}
            style={[styles.label, size === 'lg' && styles.labelLg, { color: labelColor[variant] }]}
          >
            {label}
          </Animated.Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  accent: { backgroundColor: colors.accent },
  surface: { backgroundColor: colors.surfaceElevated },
  outline: { borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
};

const labelColor: Record<ButtonVariant, string> = {
  accent: colors.onAccent,
  surface: colors.text,
  outline: colors.text,
  ghost: colors.textMuted,
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
  },
  md: { height: 46 },
  lg: { height: 56 },
  fullWidth: { alignSelf: 'stretch' },
  inert: { opacity: 0.4 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: fontSize.md,
  },
  labelLg: {
    fontSize: fontSize.lg,
  },
});
