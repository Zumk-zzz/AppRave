import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, Segmented, Text } from '@/src/components';
import { formatContact } from '@/src/lib/contact';
import { applyPhoneEdit, formatPhone, isPhoneComplete, toE164 } from '@/src/lib/phone';
import { authService } from '@/src/services';
import { colors, fonts, radius, spacing } from '@/src/theme';

type Channel = 'phone' | 'email';

/**
 * Вход по телефону или почте.
 *
 * Канал выбирается явно, а не угадывается по набранному. Угадывание
 * выглядит умнее, но на деле мешает: пока в поле нет собаки, телефон
 * показывает обычную клавиатуру, и номер набирается по буквенным
 * клавишам. Выбранный канал сразу даёт нужную клавиатуру и маску.
 *
 * Пароля нет намеренно. Код и так приходит на этот же контакт, так что
 * пароль не добавил бы защиты — зато его пришлось бы где-то хранить,
 * восстанавливать и объяснять требования к нему.
 */
export default function ContactScreen() {
  const router = useRouter();

  const [channel, setChannel] = useState<Channel>('phone');
  const [digits, setDigits] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = channel === 'phone' ? isPhoneComplete(digits) : emailValid;
  const contact = channel === 'phone' ? toE164(digits) : email.trim().toLowerCase();

  const switchTo = (next: Channel) => {
    setChannel(next);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!ready || sending) return;

    setSending(true);
    setError(null);

    try {
      await authService.requestCode(contact);
      router.push({ pathname: '/(auth)/otp', params: { contact } });
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
          <Text variant="title">Вход</Text>
          <Text variant="body" tone="muted" style={styles.lead}>
            Пришлём код подтверждения — в SMS или письмом
          </Text>

          <View style={styles.switch}>
            <Segmented
              options={[
                { value: 'phone', label: 'Телефон' },
                { value: 'email', label: 'Почта' },
              ]}
              value={channel}
              onChange={switchTo}
            />
          </View>

          {channel === 'phone' ? (
            <TextInput
              // Ключ обязателен: без него React видит на этом месте тот же
              // TextInput и просто меняет свойства, а iOS не перестраивает
              // уже открытую клавиатуру. Переключившись на почту, человек
              // остаётся с цифровой клавиатурой и не может набрать адрес.
              key="phone-field"
              value={formatPhone(digits)}
              onChangeText={(next) => {
                setDigits(applyPhoneEdit(digits, next));
                setError(null);
              }}
              placeholder="+7 (900) 000-00-00"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              autoFocus
              style={[styles.input, !!error && styles.inputError]}
              onSubmitEditing={handleSubmit}
            />
          ) : (
            <TextInput
              key="email-field"
              value={email}
              onChangeText={(next) => {
                setEmail(next);
                setError(null);
              }}
              placeholder="you@mail.ru"
              placeholderTextColor={colors.textFaint}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              style={[styles.input, !!error && styles.inputError]}
              onSubmitEditing={handleSubmit}
            />
          )}

          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : ready ? (
            <Text variant="caption" tone="accent">
              Код придёт на {formatContact(contact)}
            </Text>
          ) : (
            <Text variant="caption" tone="faint">
              {channel === 'phone'
                ? 'Демо: 900 000-00-0X — роли сотрудников (0 админ, 1 менеджер, 2 бармен, 3 фейс-контроль). Любой другой номер — гость.'
                : 'Аккаунт один: если почта привязана к тому же человеку, войдёте в свой профиль с баллами и историей.'}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <Button
            label="Получить код"
            size="lg"
            fullWidth
            disabled={!ready}
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
    marginBottom: spacing.lg,
  },
  switch: {
    marginBottom: spacing.md,
  },
  input: {
    fontFamily: fonts.display,
    fontSize: 22,
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
