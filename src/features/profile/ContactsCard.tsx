import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Field, SectionHeader, Sheet, Text } from '@/src/components';
import { formatContact, parseContact, type Channel } from '@/src/lib/contact';
import { authService, DEMO_CODE, InvalidCodeError } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { colors, spacing } from '@/src/theme';

/**
 * Способы входа в аккаунт.
 *
 * Второй канал нужен не для удобства, а на форс-мажор: человек сменил
 * номер или потерял доступ к почте. С привязанной запаской он остаётся
 * тем же аккаунтом — с баллами, историей и должностью, — вместо того
 * чтобы заводить нового человека и переносить всё руками.
 */
export function ContactsCard() {
  const user = useAuthStore((s) => s.user);
  const linkContact = useAuthStore((s) => s.linkContact);

  const [adding, setAdding] = useState<Channel | null>(null);
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const parsed = parseContact(value);
  const channelMatches = parsed?.channel === adding;

  const reset = () => {
    setAdding(null);
    setValue('');
    setCode('');
    setSent(false);
    setError(null);
  };

  const handleSend = async () => {
    if (!parsed || !channelMatches) return;

    setBusy(true);
    setError(null);

    try {
      await authService.requestCode(parsed.value);
      setSent(true);
    } catch {
      setError('Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsed) return;

    setBusy(true);
    setError(null);

    try {
      await linkContact(parsed.value, code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
    } catch (e) {
      setError(e instanceof InvalidCodeError ? 'Неверный код' : 'Не удалось привязать');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeader title="Вход в аккаунт" kicker="Телефон и почта" spaced />

      <Card style={styles.card}>
        <Row
          icon="call-outline"
          label="Телефон"
          value={user.phone ? formatContact(user.phone) : undefined}
          onAdd={() => setAdding('phone')}
        />
        <Row
          icon="mail-outline"
          label="Почта"
          value={user.email}
          onAdd={() => setAdding('email')}
        />

        <Text variant="caption" tone="faint">
          Войти можно любым из привязанных способов — аккаунт один.
        </Text>
      </Card>

      <Sheet
        visible={adding !== null}
        onClose={reset}
        title={adding === 'email' ? 'Привязать почту' : 'Привязать телефон'}
      >
        <View style={styles.sheet}>
          <Field
            label={adding === 'email' ? 'Почта' : 'Телефон'}
            value={value}
            onChangeText={(next) => {
              setValue(next);
              setError(null);
            }}
            placeholder={adding === 'email' ? 'you@mail.ru' : '+7 900 000-00-00'}
            keyboardType={adding === 'email' ? 'email-address' : 'number-pad'}
            autoCapitalize="none"
            editable={!sent}
            hint={
              value && !channelMatches
                ? adding === 'email'
                  ? 'Здесь нужна почта'
                  : 'Здесь нужен номер телефона'
                : undefined
            }
          />

          {sent && (
            <Field
              label="Код подтверждения"
              value={code}
              onChangeText={setCode}
              placeholder={DEMO_CODE}
              keyboardType="number-pad"
              maxLength={6}
              hint={`Отправили на ${parsed ? formatContact(parsed.value) : ''}`}
            />
          )}

          {error && (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          )}

          {sent ? (
            <Button
              label="Привязать"
              size="lg"
              fullWidth
              loading={busy}
              disabled={code.length < 4}
              onPress={handleConfirm}
            />
          ) : (
            <Button
              label="Получить код"
              size="lg"
              fullWidth
              loading={busy}
              disabled={!channelMatches}
              onPress={handleSend}
            />
          )}
        </View>
      </Sheet>
    </>
  );
}

function Row({
  icon,
  label,
  value,
  onAdd,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onAdd: () => void;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={value ? colors.accent : colors.textFaint} />

      <View style={styles.rowText}>
        <Text variant="caption" tone="faint">
          {label}
        </Text>
        <Text variant="body" tone={value ? 'default' : 'faint'}>
          {value ?? 'Не привязан'}
        </Text>
      </View>

      {value ? (
        <Badge label="Активен" tone="success" />
      ) : (
        <Button label="Привязать" variant="surface" onPress={onAdd} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  sheet: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
