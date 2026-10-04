import { useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, Share, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Field, Text } from '@/src/components';
import { barProgress, barStage, BAR_STAGE_LABEL, entryAvailable, entryTotal, entryUsed } from '@/src/lib/fulfillment';
import { ordersService, type EntryInvitation, type Order } from '@/src/services';
import { useOrdersStore } from '@/src/store/orders';
import { spacing } from '@/src/theme';

export function FulfillmentPanel({ order }: { order: Order }) {
  const refreshOne = useOrdersStore((s) => s.refreshOne);
  const [invites, setInvites] = useState<EntryInvitation[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');
  const locked = useRef(false);
  const total = order.lines.reduce((n, l) => n + entryTotal(l), 0);
  const left = order.lines.reduce((n, l) => n + entryAvailable(l), 0);
  const used = order.lines.reduce((n, l) => n + entryUsed(l), 0);
  const bar = order.lines.filter((l) => l.kind === 'bar');
  const live = order.status === 'paid' || order.status === 'used';

  useFocusEffect(useCallback(() => {
    let active = true, reading = false;
    const read = async () => {
      if (reading || !active || AppState.currentState !== 'active') return;
      reading = true;
      try {
        await refreshOne(order.id);
        const items = total > 0 ? await ordersService.invitations(order.id) : [];
        if (active) { setInvites(items); setError(''); }
      } catch { if (active) setError('Не удалось обновить состояние. Показаны последние данные.'); }
      finally { reading = false; }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [order.id, total, refreshOne]));

  const run = async (action: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      await action(); await refreshOne(order.id);
      if (total > 0) setInvites(await ordersService.invitations(order.id));
      setError('');
    } catch (e) { Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз'); }
    finally { locked.current = false; setBusy(false); }
  };

  return <View style={styles.content}>
    {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
    {bar.length > 0 && <Card style={styles.card}>
      <Text variant="subtitle">Ваши напитки</Text>
      {bar.map((line) => <View key={line.id} style={styles.line}>
        <Text variant="bodyStrong">{line.title} × {line.qty}</Text>
        <Badge label={live ? BAR_STAGE_LABEL[barStage(line)] : 'Заказ не обслуживается'} tone={live && (line.readyQty ?? 0) > 0 ? 'success' : 'neutral'} />
        <Text variant="caption" tone="muted">{barProgress(line)}</Text>
      </View>)}
      {live && bar.some((l) => (l.readyQty ?? 0) > 0) && <Text variant="body" tone="accent">Подходите к бару за готовыми напитками. Покажите основной QR заказа.</Text>}
      {order.status === 'paid' && bar.some((l) => barStage(l) === 'waiting') && <>
        <Text variant="caption" tone="muted">Начните приготовление, когда будете готовы забрать напитки. Сначала фейсер должен подтвердить ваш вход. После отправки в бар отменить напитки нельзя.</Text>
        <Button label="Начать готовить" disabled={busy || !!error} onPress={() => void run(() => ordersService.requestBar(order.id))} />
      </>}
    </Card>}
    {total > 0 && <Card style={styles.card}>
      <Text variant="subtitle">Вход компании</Text>
      <Text variant="body">Прошли {used} из {total} · доступно по основному QR: {left}</Text>
      <Text variant="caption" tone="muted">Приходите вместе или отправьте другу личное приглашение. Оно резервирует один проход и не даёт доступа к вашим напиткам.</Text>
      {live && invites.map((invite) => <View key={invite.id} style={styles.line}>
        <Text variant="bodyStrong">{invite.name} · {invite.revokedAt ? 'отозвано' : invite.admittedAt ? 'прошёл' : invite.claimedById ? 'принято' : 'ждёт принятия'}</Text>
        {!invite.revokedAt && !invite.admittedAt && <>
          <Button label="Поделиться приглашением" variant="outline" disabled={busy} onPress={() => void Share.share({ message: `Приглашение на ${order.eventTitle ?? 'вечеринку'}: ${Linking.createURL('/invite', { queryParams: { token: invite.token } })}` }).catch(() => Alert.alert('Не удалось открыть отправку'))} />
          <Button label="Отозвать и вернуть проход" variant="ghost" disabled={busy} onPress={() => void run(() => ordersService.revokeInvitation(invite.token))} />
        </>}
      </View>)}
      {order.status === 'paid' && left > 0 && <>
        <Field label="Имя друга" value={name} onChangeText={setName} maxLength={80} />
        <Button label="Создать личное приглашение" disabled={busy || !name.trim() || !!error} onPress={() => {
          requestId.current ||= `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
          void run(async () => {
            await ordersService.createInvitation(order.id, name.trim(), requestId.current);
            requestId.current = ''; setName('');
          });
        }} />
      </>}
    </Card>}
  </View>;
}
const styles = StyleSheet.create({ content: { gap: spacing.lg, marginTop: spacing.lg }, card: { gap: spacing.md }, line: { gap: spacing.sm } });
