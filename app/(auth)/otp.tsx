import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, Text } from '@/src/components';
import { formatContact, parseContact } from '@/src/lib/contact';
import { authService, DEMO_CODE, InvalidCodeError } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { colors, fonts, radius, spacing } from '@/src/theme';

const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;

export default function OtpScreen() {
  const router = useRouter();
  const { contact } = useLocalSearchParams<{ contact: string }>();
  const signIn = useAuthStore((s) => s.signIn);

  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const submit = async (value: string) => {
    if (checking) return;

    setChecking(true);
    setError(null);

    try {
      await signIn(contact ?? '', value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Никакой навигации: guard в корневом layout сам перебросит в (tabs),
      // как только статус станет authed.
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(
        e instanceof InvalidCodeError ? 'Неверный код' : 'Что-то пошло не так. Попробуйте ещё раз.',
      );
      setCode('');
    } finally {
      setChecking(false);
    }
  };

  const handleChange = (next: string) => {
    const digitsOnly = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digitsOnly);
    setError(null);

    if (digitsOnly.length === CODE_LENGTH) {
      void submit(digitsOnly);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0) return;
    setSecondsLeft(RESEND_SECONDS);
    setError(null);
    try {
      await authService.requestCode(contact ?? '');
    } catch {
      setError('Не удалось отправить код повторно');
    }
  };

  const prettyContact = contact ? formatContact(contact) : '';
  // Заголовок зависит от канала: «код из SMS» на письме выглядит ошибкой
  const isEmail = parseContact(contact ?? '')?.channel === 'email';

  return (
    <Screen>
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
        <Text variant="title">{isEmail ? 'Код из письма' : 'Код из SMS'}</Text>
        <Text variant="body" tone="muted" style={styles.lead}>
          Отправили на {prettyContact}
        </Text>

        {/* Настоящий ввод спрятан под ячейками: так работает системная
            клавиатура и автоподстановка кода, а выглядит это как 4 поля. */}
        <Pressable onPress={() => inputRef.current?.focus()} style={styles.cells}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => {
            const filled = i < code.length;
            const active = i === code.length;
            return (
              <View
                key={i}
                style={[
                  styles.cell,
                  active && styles.cellActive,
                  filled && styles.cellFilled,
                  !!error && styles.cellError,
                ]}
              >
                <Text style={styles.cellText}>{code[i] ?? ''}</Text>
              </View>
            );
          })}
        </Pressable>

        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={CODE_LENGTH}
          editable={!checking}
          style={styles.hiddenInput}
        />

        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : (
          <Text variant="caption" tone="faint">
            Демо-режим: код {DEMO_CODE}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <Button
          label={secondsLeft > 0 ? `Отправить повторно через ${secondsLeft} с` : 'Отправить повторно'}
          variant="ghost"
          fullWidth
          disabled={secondsLeft > 0 || checking}
          onPress={handleResend}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  cells: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  cell: {
    flex: 1,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: {
    borderColor: colors.accent,
  },
  cellFilled: {
    backgroundColor: colors.surfaceElevated,
  },
  cellError: {
    borderColor: colors.danger,
  },
  cellText: {
    fontFamily: fonts.display,
    fontSize: 30,
    // lineHeight обязателен: базовый вариант Text задаёт 22, и цифра
    // Unbounded в такую строку не помещается — верх и низ срезаются
    lineHeight: 40,
    textAlign: 'center',
    color: colors.text,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  actions: {
    paddingBottom: spacing.xl,
  },
});
