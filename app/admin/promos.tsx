import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Field, NumberField, Screen, Segmented, Sheet, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatPrice } from '@/src/lib/format';
import { adminService, type ClubEvent, type Promo, type PromoRule } from '@/src/services';
import { useCan } from '@/src/store/auth';
import { spacing } from '@/src/theme';

const empty: PromoRule = { code: '', title: '', kind: 'percent', value: 10, scope: 'tickets', active: false, eventId: null, minSubtotalKopecks: 0, maxUses: null, perUserLimit: 1, startsAt: null, endsAt: null };
function day(value: string | null) { return value ? new Date(new Date(value).getTime() + 3 * 3600000).toISOString().slice(0, 10) : ''; }
function date(value: string, end = false) {
  if (!value.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Введите дату в формате ГГГГ-ММ-ДД');
  const d = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+03:00`);
  if (!Number.isFinite(d.getTime()) || day(d.toISOString()) !== value) throw new Error('Проверьте дату');
  return d.toISOString();
}

export default function PromosScreen() {
  const allowed = useCan('promos:manage');
  const [promos, setPromos] = useState<Promo[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [rule, setRule] = useState<PromoRule>(empty);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const load = useCallback(async () => {
    if (!allowed) return;
    try { const [p, e] = await Promise.all([adminService.promos(), adminService.events()]); setPromos(p); setEvents(e); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить промокоды'); }
  }, [allowed]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const patch = (change: Partial<PromoRule>) => setRule(r => ({ ...r, ...change }));
  const open = (p?: Promo) => { setRule(p ?? { ...empty }); setStart(day(p?.startsAt ?? null)); setEnd(day(p?.endsAt ?? null)); setFormError(''); setEditing(p?.id ?? null); };
  const save = async () => {
    if (busy) return;
    setBusy(true); setFormError('');
    try {
      const body = { ...rule, code: rule.code.trim().toUpperCase(), title: rule.title.trim(), startsAt: date(start), endsAt: date(end, true) };
      if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(body.code)) throw new Error('Код: 3–32 латинские буквы, цифры, дефис или подчёркивание');
      if (!body.title || body.value < 1 || (body.kind === 'percent' && body.value > 90)) throw new Error('Укажите название и скидку: процент от 1 до 90 либо сумму в рублях');
      if (body.startsAt && body.endsAt && Date.parse(body.endsAt) <= Date.parse(body.startsAt)) throw new Error('Конец действия должен быть позже начала');
      if (editing) await adminService.updatePromo(editing, body); else await adminService.createPromo(body);
      setEditing(undefined); await load();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Не удалось сохранить'); }
    finally { setBusy(false); }
  };
  if (!allowed) return <Screen><Text>Управлять промокодами может только администратор.</Text></Screen>;
  return <Screen scroll>
    <AdminHeader title="Промокоды" subtitle="Скидки и лимиты применений" />
    <View style={styles.stack}>
      <Button label="Добавить промокод" onPress={() => open()} />
      {!!error && <Text tone="danger">{error}</Text>}
      {!promos.length && <Text tone="muted">Промокодов пока нет.</Text>}
      {promos.map(p => <Card key={p.id} style={styles.stack}>
        <Text variant="subtitle">{p.code} · {p.kind === 'percent' ? `${p.value}%` : formatPrice(p.value / 100)}</Text>
        <Text>{p.title}</Text>
        <Badge label={!p.active ? 'Выключен' : p.endsAt && Date.parse(p.endsAt) <= Date.now() ? 'Истёк' : p.startsAt && Date.parse(p.startsAt) > Date.now() ? 'Запланирован' : 'Включён'} />
        <Text variant="caption" tone="muted">{p.scope === 'tickets' ? 'Билеты' : p.scope === 'bar' ? 'Бар' : 'Билеты и бар'} · {p.eventId ? events.find(e => e.id === p.eventId)?.title ?? 'Выбранная вечеринка' : 'Все вечеринки'}{p.minSubtotalKopecks ? ` · от ${formatPrice(p.minSubtotalKopecks / 100)}` : ''}</Text>
        <Text variant="caption">Использовано: {p.used}{p.maxUses ? ` из ${p.maxUses}` : ''} · в ожидании оплаты: {p.reserved} · на гостя: {p.perUserLimit}</Text>
        <Button label="Изменить" variant="outline" onPress={() => open(p)} />
      </Card>)}
    </View>
    <Sheet visible={editing !== undefined} onClose={() => { if (!busy) setEditing(undefined); }} title={editing ? 'Изменить промокод' : 'Новый промокод'}>
      <View style={styles.stack} pointerEvents={busy ? 'none' : 'auto'}>
        <Field label="Код" value={rule.code} editable={!editing} autoCapitalize="characters" autoCorrect={false} onChangeText={code => patch({ code })} maxLength={32} />
        <Field label="Название для сотрудников" value={rule.title} onChangeText={title => patch({ title })} maxLength={100} />
        <Segmented label="Тип скидки" value={rule.kind} options={[{ value: 'percent', label: 'Проценты' }, { value: 'fixed', label: 'Рубли' }]} onChange={kind => patch({ kind, value: kind === 'percent' ? 10 : 10000 })} />
        <NumberField label="Скидка" value={rule.kind === 'percent' ? rule.value : rule.value / 100} suffix={rule.kind === 'percent' ? '%' : '₽'} max={rule.kind === 'percent' ? 90 : 1000000} onChangeValue={v => patch({ value: rule.kind === 'percent' ? v : v * 100 })} />
        <Segmented label="На какие позиции" value={rule.scope} options={[{ value: 'tickets', label: 'Билеты' }, { value: 'bar', label: 'Бар' }, { value: 'tickets_bar', label: 'Оба' }]} onChange={scope => patch({ scope })} />
        <Text variant="caption" tone="muted">На депозит столика скидка не действует. Заказ с промокодом можно отменить только целиком.</Text>
        <Segmented scrollable label="Вечеринка" value={rule.eventId ?? ''} options={[{ value: '', label: 'Все' }, ...events.map(e => ({ value: e.id, label: e.title }))]} onChange={eventId => patch({ eventId: eventId || null })} />
        <NumberField label="Минимальная сумма подходящих позиций" value={rule.minSubtotalKopecks / 100} suffix="₽" max={1000000} onChangeValue={v => patch({ minSubtotalKopecks: v * 100 })} />
        <NumberField label="Общий лимит (0 — без лимита)" value={rule.maxUses ?? 0} max={1000000} onChangeValue={maxUses => patch({ maxUses: maxUses || null })} />
        <NumberField label="Сколько раз может применить один гость" value={rule.perUserLimit} min={1} max={1000} onChangeValue={perUserLimit => patch({ perUserLimit })} />
        <Field label="Начало: ГГГГ-ММ-ДД" value={start} onChangeText={setStart} maxLength={10} hint="Пусто — сразу. Все даты по московскому времени." />
        <Field label="Последний день: ГГГГ-ММ-ДД" value={end} onChangeText={setEnd} maxLength={10} hint="Пусто — без срока окончания." />
        <Segmented label="Состояние" value={rule.active ? 'on' : 'off'} options={[{ value: 'off', label: 'Выключен' }, { value: 'on', label: 'Включён' }]} onChange={v => patch({ active: v === 'on' })} />
        {!!formError && <Text tone="danger">{formError}</Text>}
        <Button label="Сохранить" loading={busy} onPress={() => void save()} />
      </View>
    </Sheet>
  </Screen>;
}
const styles = StyleSheet.create({ stack: { gap: spacing.md, marginBottom: spacing.lg } });
