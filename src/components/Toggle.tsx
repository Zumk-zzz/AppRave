import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { colors, spacing } from '@/src/theme';
import { Text } from './Text';

export interface ToggleProps {
  label: string;
  hint?: string;
  value: boolean;
  /** Пока идёт переключение: второе нажатие подряд ничего не даст */
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

/** Строка с переключателем. Нажатие на всю строку, а не только на сам тумблер. */
export function Toggle({ label, hint, value, disabled, onChange }: ToggleProps) {
  const handle = (next: boolean) => {
    if (disabled) return;
    Haptics.selectionAsync();
    onChange(next);
  };

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      onPress={() => handle(!value)}
      style={styles.root}
    >
      <View style={styles.texts}>
        <Text variant="body">{label}</Text>
        {hint && (
          <Text variant="caption" tone="faint">
            {hint}
          </Text>
        )}
      </View>

      <Switch
        value={value}
        onValueChange={handle}
        trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.surfaceElevated}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 44,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
});
