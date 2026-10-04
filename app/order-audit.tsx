import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Field, Screen, Text } from '@/src/components';
import { ordersService, type Order, type OrderActivity } from '@/src/services';
import { ACTION_LABEL } from '@/src/store/staff';
import { useCan } from '@/src/store/auth';
import { formatPrice } from '@/src/lib/format';
import { spacing } from '@/src/theme';
export default function OrderAuditScreen(){
  const router=useRouter(),may=useCan('orders:read');
  const {number:initial}=useLocalSearchParams<{number?:string}>();
  const [number,setNumber]=useState(initial??''),[order,setOrder]=useState<Order|null>(null),[rows,setRows]=useState<OrderActivity[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  const load=useCallback(async(value:string)=>{if(lock.current||!may)return;lock.current=true;setBusy(true);try{const data=await ordersService.timeline(value.trim().toUpperCase());setOrder(data.order);setRows(data.rows);setError('');}catch(e){setOrder(null);setRows([]);setError(e instanceof Error?e.message:'Не удалось найти заказ');}finally{lock.current=false;setBusy(false);}},[may]);
  useEffect(()=>{if(initial&&may)void load(initial);},[initial,may,load]);
  return <Screen scroll><View style={styles.content}>
    <Button label="Назад" variant="surface" onPress={()=>router.back()}/><Text variant="title">Разбор заказа</Text>
    {may?<><Field label="Номер заказа" value={number} onChangeText={setNumber} autoCapitalize="characters" placeholder="ORD-ABCD"/><Button label="Показать всю историю" disabled={busy||!number.trim()} onPress={()=>void load(number)}/>
      {error?<Text variant="body" tone="danger">{error}</Text>:null}
      {order&&<Card style={styles.content}><Text variant="display">{order.number}</Text><Text variant="body">{order.eventTitle} · {formatPrice(order.total)}</Text>{!!order.depositUsed&&<Text variant="body">Из депозита: {formatPrice(order.depositUsed)}</Text>}{order.lines.map(l=><Text key={l.id} variant="caption">{l.title} × {l.qty} · выдано {l.redeemed} · отменено {l.cancelled??0}</Text>)}</Card>}
      {rows.map(r=><Card key={r.id} style={styles.card}><Text variant="bodyStrong">{ACTION_LABEL[r.kind as keyof typeof ACTION_LABEL]??r.title.split(' · ')[0]}</Text><Text variant="body">{r.title}</Text><Text variant="caption" tone="muted">{new Date(r.createdAt).toLocaleString('ru-RU')}{r.actorName?` · ${r.actorName}`:''}</Text></Card>)}
    </>:<Text variant="body">Полный разбор доступен управляющему.</Text>}
  </View></Screen>;
}
const styles=StyleSheet.create({content:{gap:spacing.lg,paddingBottom:spacing.xl},card:{gap:spacing.sm}});
