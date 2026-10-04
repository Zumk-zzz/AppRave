import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Button, Card, Field, Screen, Text } from '@/src/components';
import { authService, ordersService, type InvitationPreview } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { colors, spacing } from '@/src/theme';

export default function InvitationScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signIn = useAuthStore((s) => s.signIn);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [length, setLength] = useState(0);
  const [devCode, setDevCode] = useState('');
  useEffect(() => {
    let active = true; setQr('');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) { setError('Неверная ссылка приглашения'); return; }
    void ordersService.invitation(token).then((value) => { if (active) setPreview(value); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить приглашение'); });
    return () => { active = false; };
  }, [token, user?.id]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true);
    try { await action(); setError(''); }
    catch (e) { Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз'); }
    finally { setBusy(false); }
  };
  return <Screen scroll><View style={styles.content}>
    <Text variant="title">Личное приглашение</Text>
    {error ? <Text variant="body" tone="danger">{error}</Text> : null}
    {preview && <Card style={styles.content}>
      <Text variant="subtitle">{preview.eventTitle}</Text>
      <Text variant="body">Для {preview.name} · один проход</Text>
      {preview.eventDate && <Text variant="caption" tone="muted">{new Date(preview.eventDate).toLocaleString('ru-RU')}</Text>}
      {preview.status === 'used' || preview.status === 'revoked' ? <Text variant="body" tone="danger">Приглашение {preview.status === 'used' ? 'уже использовано' : 'отозвано'}</Text> : <>
        {!user ? <>
          <Text variant="body">Войдите, чтобы закрепить проход за своим аккаунтом.</Text>
          {!sentTo ? <>
            <Field label="Телефон или почта" value={contact} onChangeText={setContact} autoCapitalize="none" />
            <Button label="Получить код" disabled={busy || !contact.trim()} onPress={() => void run(async () => {
              const result = await authService.requestCode(contact.trim());
              setSentTo(contact.trim()); setLength(result.codeLength); setDevCode(result.devCode ?? '');
            })} />
          </> : <>
            <Text variant="caption" tone="muted">Код для {sentTo}{devCode ? ` · Демо-код: ${devCode}` : ''}</Text>
            <Field label="Код входа" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, length))} keyboardType="number-pad" maxLength={length} />
            <Button label="Войти" disabled={busy || code.length !== length} onPress={() => void run(() => signIn(sentTo, code))} />
            <Button label="Изменить контакт / запросить код снова" variant="ghost" disabled={busy} onPress={() => { setSentTo(''); setCode(''); }} />
          </>}
        </> : <>
          <Text variant="caption" tone="muted">Приглашение закрепится за аккаунтом {user.name}. Его нельзя использовать для получения напитков.</Text>
          {!qr && <Button label="Принять и показать мой QR" disabled={busy} onPress={() => void run(async () => setQr((await ordersService.claimInvitation(token)).qrPayload))} />}
          {qr && <View style={styles.qr}><QRCode value={qr} size={216} color={colors.qrForeground} backgroundColor={colors.qrBackground} /></View>}
          {qr && <Text variant="body">Покажите код фейсеру. Повторный проход по нему невозможен.</Text>}
        </>}
      </>}
    </Card>}
    <Button label="На главную" variant="surface" onPress={() => router.replace(user ? '/(tabs)' : '/(auth)')} />
  </View></Screen>;
}
const styles = StyleSheet.create({ content: { gap: spacing.lg, paddingBottom: spacing.lg }, qr: { backgroundColor: colors.qrBackground, alignSelf: 'center', padding: spacing.lg } });
