import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Screen, Sheet, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { nearestEvent } from '@/src/lib/events';
import { TABLE_SERVICE_LABEL } from '@/src/lib/fulfillment';
import { formatPrice } from '@/src/lib/format';
import { eventsService, ordersService, type OperationalTable, type BarWorker, type TableServiceState } from '@/src/services';
import { useAuthStore, useCan } from '@/src/store/auth';
import { spacing } from '@/src/theme';
const NEXT: Partial<Record<TableServiceState,TableServiceState>>={reserved:'arrived',arrived:'occupied',occupied:'released'};
export default function FloorScreen() {
  const user=useAuthStore((s)=>s.user),may=useCan('orders:read');
  const [tables,setTables]=useState<OperationalTable[]>([]),[team,setTeam]=useState<BarWorker[]>([]);
  const [title,setTitle]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [target,setTarget]=useState<OperationalTable|null>(null);
  const lock=useRef(false);
  const read=useCallback(async()=>{if(!may)return;try{const event=nearestEvent(await eventsService.list());setTitle(event?.title??'Вечеринки нет');setTables(event?await ordersService.floor(event.id):[]);setTeam(await ordersService.barTeam());setError('');}catch(e){setError(e instanceof Error?e.message:'Не удалось обновить столики');}},[may]);
  useFocusEffect(useCallback(()=>{void read();const timer=setInterval(()=>{if(AppState.currentState==='active'&&!lock.current)void read();},5000);return()=>clearInterval(timer);},[read]));
  const update=async(t:OperationalTable,state:TableServiceState,responsibleId?:string)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await ordersService.updateTable(t,state,responsibleId);setTarget(null);}catch(e){Alert.alert('Не получилось',e instanceof Error?e.message:'Обновите столики');}finally{await read();lock.current=false;setBusy(false);}};
  return <Screen scroll><AdminHeader title="Столики в зале" subtitle={title}/><View style={styles.content}>
    {!may?<Text variant="body">Раздел доступен управляющему.</Text>:<>
      <Text variant="caption" tone="muted">Освобождение завершает обслуживание. Повторная продажа этой брони на ту же вечеринку не открывается автоматически.</Text>
      {error?<Text variant="body" tone="danger">{error}</Text>:null}
      <Button label="Обновить" variant="outline" disabled={busy} onPress={()=>void read()}/>
      {tables.map(t=><Card key={t.id} style={styles.card}>
        <Text variant="title">{t.label} · {t.orderNumber}</Text><Badge label={TABLE_SERVICE_LABEL[t.serviceState]} tone={t.serviceState==='occupied'?'success':'neutral'}/>
        <Text variant="body">{t.guestName} {t.guests.length?`· ${t.guests.join(', ')}`:''}</Text>
        <Text variant="caption">Ответственный: {t.responsibleName??'не назначен'}</Text>
        <Text variant="body">Депозит: {formatPrice(t.depositRemaining)} из {formatPrice(t.depositInitial)}</Text>
        {NEXT[t.serviceState]&&<Button label={TABLE_SERVICE_LABEL[NEXT[t.serviceState]!]} disabled={busy} onPress={()=>{ const next=NEXT[t.serviceState]!; if(next==='released'&&t.depositRemaining>0) Alert.alert('Завершить обслуживание?',`Неиспользованный депозит: ${formatPrice(t.depositRemaining)}. После освобождения заказывать из него нельзя.`,[{text:'Оставить',style:'cancel'},{text:'Гости ушли — завершить',onPress:()=>void update(t,next)}]);else void update(t,next); }} />}
        {t.serviceState!=='released'&&<Button label="Назначить ответственного" variant="outline" disabled={busy} onPress={()=>setTarget(t)}/>}
      </Card>)}
      {!error&&tables.length===0&&<Text variant="body" tone="muted">Оплаченных броней нет.</Text>}
    </>}
    <Sheet visible={!!target} title="Ответственный за стол" onClose={()=>{if(!busy)setTarget(null);}}><View style={styles.content}>
      {user&&<Button label={`Назначить себя: ${user.name}`} disabled={busy} onPress={()=>{if(target)void update(target,target.serviceState,user.id);}}/>}
      {team.filter(w=>w.id!==user?.id).map(w=><Button key={w.id} label={w.name} variant="outline" disabled={busy} onPress={()=>{if(target)void update(target,target.serviceState,w.id);}}/>)}
    </View></Sheet>
  </View></Screen>;
}
const styles=StyleSheet.create({content:{gap:spacing.lg,paddingBottom:spacing.xl},card:{gap:spacing.md}});
