import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';
import { Text } from './Text';

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

/** Счётчик «−  2  +» для позиций бара и количества билетов. */
export function Stepper({ value, onChange, min = 0, max = 99 }: StepperProps) {
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    Haptics.selectionAsync();
    onChange(next);
  };

  return (
    <View style={styles.root}>
      <StepButton label="−" onPress={() => step(-1)} disabled={value <= min} />
      <Text style={styles.value}>{value}</Text>
      <StepButton label="+" onPress={() => step(1)} disabled={value >= max} />
    </View>
  );
}

function StepButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Добавить' : 'Убрать'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    padding: 3,
    gap: spacing.xs,
  },
  button: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  buttonPressed: {
    backgroundColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: fontSize.lg,
    lineHeight: 22,
    color: colors.text,
  },
  value: {
    minWidth: 22,
    textAlign: 'center',
    fontFamily: fonts.bodySemi,
    fontSize: fontSize.md,
    color: colors.text,
  },
});
