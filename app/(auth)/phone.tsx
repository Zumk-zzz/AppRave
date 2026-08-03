import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, Text } from '@/src/components';
import { extractDigits, formatPhone, isPhoneComplete, toE164 } from '@/src/lib/phone';
import { ADMIN_PHONE, authService } from '@/src/services';
import { colors, fonts, radius, spacing } from '@/src/theme';

export default function PhoneScreen() {
  const router = useRouter();
  const [digits, setDigits] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const display = formatPhone(digits);

  const handleChange = (next: string) => {
    setError(null);
    const nextDigits = extractDigits(next);

    // Пользователь стёр символ маски — скобку или дефис. Цифры при этом
    // не изменились, поэтому удаляем последнюю вручную, иначе ввод
    // «залипает» и стереть номер до конца невозможно.
    if (nextDigits === digits && next.length < display.length) {
      setDigits(digits.slice(0, -1));
      return;
    }

    setDigits(nextDigits);
  };

  const handleSubmit = async () => {
    if (!isPhoneComplete(digits) || sending) return;

    setSending(true);
    setError(null);

    try {
      const phone = toE164(digits);
      await authService.requestCode(phone);
      router.push({ pathname: '/(auth)/otp', params: { phone } });
    } catch {
      setError('Не удалось отправить код. Попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textMuted} />
        </Pressable>

        <View style={styles.body}>
          <Text variant="title">Ваш номер</Text>
          <Text variant="body" tone="muted" style={styles.lead}>
            Пришлём код подтверждения в SMS
          </Text>

          <TextInput
            value={display}
            onChangeText={handleChange}
            placeholder="+7 (___) ___-__-__"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            autoFocus
            maxLength={18}
            style={[styles.input, !!error && styles.inputError]}
            onSubmitEditing={handleSubmit}
          />

          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : (
            <Text variant="caption" tone="faint">
              Демо: {formatPhone(ADMIN_PHONE.replace(/^\+7/, ''))} — вход администратором
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <Button
            label="Получить код"
            size="lg"
            fullWidth
            disabled={!isPhoneComplete(digits)}
            loading={sending}
            onPress={handleSubmit}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: {
    flex: 1,
    paddingTop: spacing.xxl,
    gap: spacing.sm,
  },
  lead: {
    marginBottom: spacing.xl,
  },
  input: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -0.5,
    color: colors.text,
    paddingVertical: spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  inputError: {
    borderBottomColor: colors.danger,
  },
  actions: {
    paddingBottom: spacing.xl,
  },
});
