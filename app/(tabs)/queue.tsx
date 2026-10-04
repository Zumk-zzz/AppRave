import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Screen, Segmented, Sheet, Field, Stepper, Text } from '@/src/components';
import { nearestEvent } from '@/src/lib/events';
import { barProgress, waitMinutes } from '@/src/lib/fulfillment';
import { eventsService, ordersService, type Order, type BarWorker } from '@/src/services';
import { useAuthStore, useCan } from '@/src/store/auth';
import { spacing } from '@/src/theme';

type Stage = 'queued' | 'preparing' | 'ready';
export default function QueueTab() {
  const router = useRouter();
  const actor = useAuthStore((s) => s.user);
  const canBar = useCan('scan:bar');
  const canRead = useCan('orders:read');
  const actorId = actor?.id;
  const [orders, setOrders] = useState<Order[]>([]);
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<Stage>('queued');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [workers, setWorkers] = useState<BarWorker[]>([]);
  const [transfer, setTransfer] = useState<{ order: Order; lineId: string } | null>(null);
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const locked = useRef(false);
  const generation = useRef(0);
  const reading = useRef(false);

  const refresh = useCallback(async () => {
    if (reading.current || locked.current || !actorId || (!canBar && !canRead)) return;
    const request = generation.current;
    reading.current = true;
    try {
      const event = nearestEvent(await eventsService.list());
      const data = event ? await ordersService.forStaff(event.id, true) : [];
      if (generation.current !== request) return;
      setTitle(event?.title ?? 'Ближайшей вечеринки нет');
      setOrders(data); setError('');
      setWorkers(await ordersService.barTeam());
    } catch (e) {
      if (generation.current === request) setError(e instanceof Error ? e.message : 'Не удалось обновить очередь');
    } finally { if (generation.current === request) reading.current = false; }
  }, [canBar, canRead, actorId]);

  useFocusEffect(useCallback(() => {
    generation.current++; reading.current = false; setOrders([]);
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 5000);
    return () => { clearInterval(timer); generation.current++; reading.current = false; };
  }, [refresh]));

  const act = async (action: () => Promise<Order>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    generation.current++; reading.current = false;
    try { await action(); }
    catch (e) { Alert.alert('Не получилось', e instanceof Error ? e.message : 'Обновите очередь'); }
    finally { locked.current = false; await refresh(); setBusy(false); }
  };

  const rows = orders.flatMap((order) => order.lines.filter((line) => {
    if (line.kind !== 'bar' || order.status !== 'paid' || (scope === 'mine' && line.preparedById !== actorId)) return false;
    if (stage === 'queued') return !!line.barRequestedAt && !line.preparedById && line.qty > line.redeemed + (line.cancelled ?? 0);
    return stage === 'preparing' ? (line.preparingQty ?? 0) > 0 : (line.readyQty ?? 0) > 0;
  }).map((line) => ({ order, line }))).sort((a, b) => (a.line.barRequestedAt ?? '').localeCompare(b.line.barRequestedAt ?? ''));

  return <Screen scroll>
    <View style={styles.content}>
      <Text variant="display">Бар</Text>
      <Text variant="body" tone="muted">{title}</Text>
      <Button label="История приготовления и выдач" variant="outline" onPress={() => router.push('/history')} />
      {!canBar && !canRead ? <Text variant="body">Откройте смену в профиле.</Text> : <>
        <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'Все позиции' }, { value: 'mine', label: 'Мои заказы' }]} />
        <Segmented value={stage} onChange={setStage} options={[
          { value: 'queued', label: 'Очередь' }, { value: 'preparing', label: 'Готовится' }, { value: 'ready', label: 'Готово' },
        ]} />
        <Button label="Обновить" variant="surface" disabled={busy} onPress={() => void refresh()} />
        {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
        {!error && rows.length === 0 && <Text variant="body" tone="muted">В этом разделе пока нет позиций.</Text>}
        {rows.map(({ order, line }) => <Card key={line.id} style={styles.card}>
          <Text variant="title">{order.number} · {order.guest?.name ?? 'Гость'}</Text>
          <Text variant="subtitle">{line.title}</Text>
          <Text variant="body" tone="muted">{barProgress(line)}</Text>
          <Text variant="caption" tone={stage !== 'ready' && waitMinutes(line) >= 15 ? 'danger' : 'muted'}>{stage === 'ready' ? 'Ждёт выдачи' : 'Ожидание'}: {waitMinutes(line)} мин{stage !== 'ready' && waitMinutes(line) >= 15 ? ' · задержка, проверьте заказ' : ''}</Text>
          {line.preparedByName && <Badge label={`Готовит: ${line.preparedByName}`} tone="neutral" />}
          {stage === 'queued' && canBar && <Button label="Принять в работу" disabled={busy}
            onPress={() => void act(() => ordersService.prepareBar(order, line.id))} />}
          {stage === 'preparing' && canBar && line.preparedById === actor?.id && <>
            <Stepper min={1} max={line.preparingQty ?? 1} value={Math.min(counts[line.id] ?? 1, line.preparingQty ?? 1)} onChange={(qty) => setCounts((prev) => ({ ...prev, [line.id]: qty }))} />
            <Button label="Отметить готовность" disabled={busy} onPress={() => void act(() => ordersService.readyBar(order, line.id, Math.min(counts[line.id] ?? 1, line.preparingQty ?? 1)))} />
          </>}
          {stage === 'preparing' && (line.preparedById === actorId || canRead) && <Button label="Передать другому бармену" variant="outline" disabled={busy} onPress={() => { setTransfer({ order, lineId: line.id }); setTargetId(''); setReason(''); }} />}
          {stage === 'ready' && <Text variant="caption" tone="accent">Гость уже видит готовность. Выдайте напитки после сканирования QR.</Text>}
        </Card>)}
      </>}
    </View>
    <Sheet visible={!!transfer} title="Передать приготовление" onClose={() => { if (!busy) setTransfer(null); }}>
      <View style={styles.content}>
        <Text variant="body">Готовые напитки останутся доступными для выдачи. Выбранный сотрудник продолжит оставшееся приготовление.</Text>
        {workers.filter((w) => w.id !== transfer?.order.lines.find((l) => l.id === transfer.lineId)?.preparedById).map((w) => <Button key={w.id} label={w.name} variant={targetId === w.id ? 'accent' : 'outline'} disabled={busy} onPress={() => setTargetId(w.id)} />)}
        <Field label="Причина передачи" value={reason} onChangeText={setReason} maxLength={300} placeholder="Заканчиваю смену" />
        <Button label="Передать" disabled={busy || !targetId || reason.trim().length < 3} onPress={() => { if (!transfer) return; const item=transfer; void act(async () => { await ordersService.transferBar(item.order,item.lineId,targetId,reason.trim()); setTransfer(null); return item.order; }); }} />
      </View>
    </Sheet>
  </Screen>;
}
const styles = StyleSheet.create({ content: { gap: spacing.lg, paddingBottom: spacing.xxl }, card: { gap: spacing.md } });
