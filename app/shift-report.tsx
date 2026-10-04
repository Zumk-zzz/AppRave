import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Field, Screen, Text } from '@/src/components';
import { formatPrice } from '@/src/lib/format';
import { staffService, type ShiftReport, type InventoryCount } from '@/src/services';
import { useAuthStore, useCan } from '@/src/store/auth';
import { useStaffStore } from '@/src/store/staff';
import { spacing } from '@/src/theme';

export default function ShiftReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const current = useStaffStore((s) => s.shift);
  const loadStaff = useStaffStore((s) => s.load);
  const canStock = useCan('stock:write');
  const [report,setReport] = useState<ShiftReport | null>(null);
  const [counts,setCounts] = useState<Record<string,string>>({});
  const [reasons,setReasons] = useState<Record<string,string>>({});
  const [note,setNote] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const read = async () => {
    try { setReport(await staffService.shiftReport(id)); setError(''); }
    catch(e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить отчёт'); }
  };
  useEffect(() => { let active=true; void staffService.shiftReport(id).then((r) => { if(active) setReport(r); }).catch((e) => { if(active) setError(e.message); }); return () => { active=false; }; },[id,user?.id]);
  const ownOpen = current?.id === id && !report?.closedAt;
  const invalid = Object.values(counts).some((v) => v.trim() !== '' && (!/^\d+$/.test(v.trim()) || !Number.isSafeInteger(Number(v))));
  const close = async () => {
    if (!user || !report || lock.current) return;
    lock.current=true; setBusy(true);
    try {
      const rows: InventoryCount[] = report.stock.filter((r) => counts[r.barItemId]?.trim()).map((r) => ({ barItemId:r.barItemId, actual:Number(counts[r.barItemId]), available:r.available, reserved:r.reserved, reason:reasons[r.barItemId] ?? '' }));
      await staffService.closeShift(user,note.trim() || undefined,rows.length ? rows : undefined);
      await loadStaff(user); await read(); setCounts({});
    } catch(e) { Alert.alert('Не удалось закрыть смену',e instanceof Error ? e.message : 'Обновите отчёт'); }
    finally { lock.current=false; setBusy(false); }
  };
  return <Screen scroll><View style={styles.content}>
    <Button label="Назад" variant="surface" onPress={() => router.back()} />
    <Text variant="title">Итоги смены и сверка</Text>
    {error ? <Text variant="body" tone="danger">{error}</Text> : null}
    {report && <>
      <Text variant="subtitle">{report.staffName}</Text>
      <Text variant="caption" tone="muted">{new Date(report.openedAt).toLocaleString('ru-RU')} — {report.closedAt ? new Date(report.closedAt).toLocaleString('ru-RU') : 'смена открыта'}</Text>
      <Badge label={report.closedAt ? report.saved ? 'Сохранённый отчёт' : 'Старые итоги без сверки' : 'Предварительные итоги'} tone="neutral" />
      <Card style={styles.content}>
        <Text variant="body">Пропущено гостей: {report.admitted}</Text>
        <Text variant="body">Принято в приготовление: {report.started} · готовность подтверждена: {report.ready} · выдано: {report.issued}</Text>
        <Text variant="body" tone={report.pendingPreparations > 0 ? 'danger' : 'muted'}>Незавершённых позиций приготовления: {report.pendingPreparations}</Text>
        {report.salesKopecks !== null && <Text variant="body">Продажи клуба за время смены: {formatPrice(report.salesKopecks/100)} · заказов: {report.soldOrders}. Оплата демонстрационная.</Text>}
        {report.items.map((r) => <Text key={r.title} variant="caption">{r.title}: принято {r.prepared}, готово {r.ready}, выдано {r.issued}</Text>)}
      </Card>
      {report.stock.length > 0 && <>
        <Text variant="subtitle">Сверка остатков</Text>
        <Text variant="caption" tone="muted">Факт считают в единицах меню. Учтите готовые порции и оплаченные напитки, которые ещё не выдали: они входят в физический остаток, хотя уже вычтены из свободного склада. Расхождения фиксируются в отчёте; склад автоматически не корректируется.</Text>
        {report.stock.map((r) => <Card key={r.barItemId} style={styles.card}>
          <Text variant="bodyStrong">{r.title} · {r.unit}</Text>
          <Text variant="caption">Свободно: {r.available} · в заказах: {r.reserved} · ожидается физически: {r.expected}</Text>
          {ownOpen && canStock ? <>
            <Field label="Фактический остаток" value={counts[r.barItemId] ?? ''} onChangeText={(v) => setCounts((prev) => ({...prev,[r.barItemId]:v}))} keyboardType="number-pad" placeholder="Не пересчитано" />
            {counts[r.barItemId]?.trim() && /^\d+$/.test(counts[r.barItemId]) && Number(counts[r.barItemId]) !== r.expected && <>
              <Text variant="body" tone="danger">Расхождение: {Number(counts[r.barItemId])-r.expected}</Text>
              <Field label="Причина расхождения" value={reasons[r.barItemId] ?? ''} onChangeText={(v) => setReasons((prev) => ({...prev,[r.barItemId]:v}))} maxLength={300} />
            </>}
          </> : <Text variant="body" tone={r.difference ? 'danger' : 'muted'}>{r.actual === null ? 'Фактический остаток не проверен' : `Факт: ${r.actual} · расхождение: ${r.difference}${r.reason ? ` · ${r.reason}` : ''}`}</Text>}
        </Card>)}
      </>}
      {ownOpen && <>
        <Field label="Заметка к закрытию" value={note} onChangeText={setNote} maxLength={500} multiline />
        <Button label={Object.values(counts).some((v) => v.trim()) ? 'Сохранить сверку и закрыть смену' : 'Закрыть смену без сверки'} disabled={busy || invalid || !!error || report.pendingPreparations > 0} onPress={() => void close()} />
        {report.pendingPreparations > 0 && <Button label="Перейти в бар и передать позиции" variant="outline" onPress={() => router.push('/(tabs)/queue')} />}
        <Button label="Обновить остатки — после этого пересчитайте факт" variant="outline" disabled={busy} onPress={() => { setCounts({}); setReasons({}); void read(); }} />
      </>}
    </>}
  </View></Screen>;
}
const styles=StyleSheet.create({content:{gap:spacing.lg,paddingBottom:spacing.xl},card:{gap:spacing.sm}});
