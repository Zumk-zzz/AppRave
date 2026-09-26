import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, Text } from '@/src/components';
import { formatContact, parseContact } from '@/src/lib/contact';
import { authService, InvalidCodeError } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { colors, fonts, radius, spacing } from '@/src/theme';

const RESEND_SECONDS = 30;

/** Длина кода на случай, если экран открыт без неё: обычный режим. */
const FALLBACK_LENGTH = 4;

/**
 * Длина из параметра маршрута.
 *
 * Параметры приходят строками и могут потеряться при переоткрытии
 * экрана, поэтому значение проверяется, а не приводится вслепую.
 */
function readLength(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 4 || parsed > 8) return FALLBACK_LENGTH;
  return parsed;
}

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ contact: string; codeLength?: string; devCode?: string }>();
  const contact = params.contact;
  const signIn = useAuthStore((s) => s.signIn);

  // Длину и подсказку приносит сервер вместе с отправкой кода: снаружи
  // код шестизначный, и четыре ячейки заполнить было просто нечем
  const [codeLength, setCodeLength] = useState(() => readLength(params.codeLength));
  const [devCode, setDevCode] = useState(params.devCode || null);

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
    const digitsOnly = next.replace(/\D/g, '').slice(0, codeLength);
    setCode(digitsOnly);
    setError(null);

    if (digitsOnly.length === codeLength) {
      void submit(digitsOnly);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0) return;
    setSecondsLeft(RESEND_SECONDS);
    setError(null);
    try {
      const sent = await authService.requestCode(contact ?? '');
      // Режим сервера мог смениться между отправками — длину перечитываем
      setCodeLength(sent.codeLength);
      setDevCode(sent.devCode ?? null);
      setCode('');
    } catch {
      setError('Не удалось отправить код повторно');
    }
  };

  // Шесть ячеек в ту же ширину не помещаются в прежнем размере:
  // на узком экране цифры налезают на границы
  const compact = codeLength > 4;

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
            клавиатура и автоподстановка кода, а выглядит это как поля. */}
        <Pressable
          onPress={() => inputRef.current?.focus()}
          style={[styles.cells, compact && styles.cellsCompact]}
        >
          {Array.from({ length: codeLength }).map((_, i) => {
            const filled = i < code.length;
            const active = i === code.length;
            return (
              <View
                key={i}
                style={[
                  styles.cell,
                  compact && styles.cellCompact,
                  active && styles.cellActive,
                  filled && styles.cellFilled,
                  !!error && styles.cellError,
                ]}
              >
                <Text style={[styles.cellText, compact && styles.cellTextCompact]}>
                  {code[i] ?? ''}
                </Text>
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
          maxLength={codeLength}
          editable={!checking}
          style={styles.hiddenInput}
        />

        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : devCode ? (
          <Text variant="caption" tone="faint">
            Демо-режим: код {devCode}
          </Text>
        ) : (
          <Text variant="caption" tone="faint">
            Код виден в окне сервера: отправка SMS ещё не подключена
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
  cellsCompact: {
    gap: spacing.sm,
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
  cellCompact: {
    height: 62,
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
  cellTextCompact: {
    fontSize: 24,
    lineHeight: 32,
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
