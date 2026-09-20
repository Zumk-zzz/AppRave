import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, Text } from '@/src/components';
import { formatContact, parseContact } from '@/src/lib/contact';
import { authService } from '@/src/services';
import { colors, fonts, radius, spacing } from '@/src/theme';

/**
 * Вход по телефону или почте.
 *
 * Поле одно, тип определяется по введённому: переключатель «телефон
 * или почта» — лишний шаг, а угадать по наличию собаки несложно.
 */
export default function ContactScreen() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseContact(value);
  const looksLikeEmail = value.includes('@');

  const handleSubmit = async () => {
    if (!parsed || sending) return;

    setSending(true);
    setError(null);

    try {
      await authService.requestCode(parsed.value);
      router.push({ pathname: '/(auth)/otp', params: { contact: parsed.value } });
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
          <Text variant="title">Телефон или почта</Text>
          <Text variant="body" tone="muted" style={styles.lead}>
            Пришлём код подтверждения — в SMS или письмом
          </Text>

          <TextInput
            value={value}
            onChangeText={(next) => {
              setValue(next);
              setError(null);
            }}
            placeholder="+7 900 000-00-00 или you@mail.ru"
            placeholderTextColor={colors.textFaint}
            // Клавиатура подстраивается под то, что уже набрано:
            // цифровая для номера, обычная как только появилась собака
            keyboardType={looksLikeEmail ? 'email-address' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            autoFocus
            style={[styles.input, !!error && styles.inputError]}
            onSubmitEditing={handleSubmit}
          />

          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : parsed ? (
            <Text variant="caption" tone="accent">
              Код придёт на {formatContact(parsed.value)}
            </Text>
          ) : (
            <Text variant="caption" tone="faint">
              Демо: 900 000-00-0X — роли сотрудников (0 админ, 1 менеджер,
              2 бармен, 3 фейс-контроль). Любой другой контакт — гость.
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <Button
            label="Получить код"
            size="lg"
            fullWidth
            disabled={!parsed}
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
