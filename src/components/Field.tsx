import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';
import { Text } from './Text';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Пояснение под полем */
  hint?: string;
  error?: string;
  /** Многострочный ввод — для описаний */
  multiline?: boolean;
}

export function Field({ label, hint, error, multiline, ...input }: FieldProps) {
  return (
    <View style={styles.root}>
      <Text variant="label" tone="faint">
        {label}
      </Text>

      <TextInput
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline, !!error && styles.inputError]}
        {...input}
      />

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface NumberFieldProps {
  label: string;
  value: number;
  onChangeValue: (next: number) => void;
  hint?: string;
  /** Подпись справа внутри поля: ₽, шт, мест */
  suffix?: string;
  min?: number;
  max?: number;
}

/**
 * Числовое поле.
 *
 * Держит собственный текстовый черновик, а не форматирует число на каждый
 * штрих: иначе стереть значение до конца невозможно — пустая строка
 * немедленно превращалась бы в ноль.
 */
export function NumberField({
  label,
  value,
  onChangeValue,
  hint,
  suffix,
  min = 0,
  max = 9_999_999,
}: NumberFieldProps) {
  const handleChange = (text: string) => {
    const digits = text.replace(/[^\d]/g, '');

    if (digits === '') {
      onChangeValue(min);
      return;
    }

    onChangeValue(Math.min(max, Math.max(min, Number(digits))));
  };

  return (
    <View style={styles.root}>
      <Text variant="label" tone="faint">
        {label}
      </Text>

      <View style={styles.numberRow}>
        <TextInput
          value={value === 0 ? '' : String(value)}
          onChangeText={handleChange}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.numberInput]}
        />
        {suffix && (
          <Text variant="body" tone="faint" style={styles.suffix}>
            {suffix}
          </Text>
        )}
      </View>

      {hint && (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.danger,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  numberInput: {
    flex: 1,
  },
  suffix: {
    minWidth: 34,
  },
});
