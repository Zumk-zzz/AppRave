import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Screen, Text } from '@/src/components';
import { formatPrice } from '@/src/lib/format';
import { ordersService, type Order, type PaymentSession } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { useOrdersStore } from '@/src/store/orders';
import { spacing } from '@/src/theme';

/** Возврат с банковской страницы не подтверждает оплату; ждём сервер. */
export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), router = useRouter();
  const [order,setOrder] = useState<Order|null>(null), [payment,setPayment] = useState<PaymentSession|null>(null);
  const [error,setError] = useState(''), [busy,setBusy] = useState(false), [review,setReview] = useState(false);
  const checking = useRef(false), lock = useRef(false);
  const refreshOne = useOrdersStore((s) => s.refreshOne), refreshUser = useAuthStore((s) => s.refresh);
  const check = useCallback(async () => {
    if (checking.current || AppState.currentState !== 'active') return;
    checking.current=true;
    try {
      const session = payment ?? await ordersService.paymentForOrder(id);
      if (!payment && session) setPayment(session);
      const data = session ? await ordersService.paymentStatus(session.providerId) : {order:await ordersService.byId(id),needsReview:false};
      setOrder(data.order); setReview(!!data.needsReview); setError('');
      if (['paid','used'].includes(data.order.status)) { await refreshOne(id); await refreshUser(); }
    } catch(e) { setError(e instanceof Error ? e.message : 'Не удалось проверить оплату'); }
    finally { checking.current=false; }
  },[id,payment,refreshOne,refreshUser]);
  useEffect(() => {
    void check(); const timer=setInterval(() => void check(),5000);
    const listener=AppState.addEventListener('change',state => {if(state==='active')void check();});
    return () => {clearInterval(timer);listener.remove();};
  },[check]);
  const start = async () => {
    if (lock.current) return; lock.current=true;setBusy(true);
    try { const next=await ordersService.startPayment(id);setPayment(next);setError(''); }
    catch(e){setError(e instanceof Error?e.message:'Не удалось создать оплату');}
    finally {lock.current=false;setBusy(false);}
  };
  const paid=order&&['paid','used'].includes(order.status);
  return <Screen scroll><View style={styles.content}>
    <Button label="К заказам" variant="outline" onPress={() => router.replace('/(tabs)/profile')}/>
    <Text variant="title">{paid?'Оплата подтверждена':'Оплата заказа'}</Text>
    <Badge label="Тестовая среда · реальные деньги не принимаются" tone="neutral" />
    {order&&<><Text variant="display">{order.number}</Text><Text variant="body">{order.eventTitle}</Text>
      <Card style={styles.content}>
        {(payment?.cart.items ?? order.lines.filter(l=>l.qty>(l.cancelled??0)).map(l=>({id:l.id,name:l.title,qty:l.qty-(l.cancelled??0),amountKopecks:Math.round(l.price*100)*(l.qty-(l.cancelled??0))-Math.round((l.discount??0)*100)}))).map(l=><View key={l.id} style={styles.row}><Text variant="body">{l.name} × {l.qty}</Text><Text variant="bodyStrong">{formatPrice(l.amountKopecks/100)}</Text></View>)}
        {!!order.promoCode && <Text variant="caption" tone="accent">Промокод {order.promoCode}: −{formatPrice(order.discount ?? 0)}</Text>}
        <Text variant="title">Итого: {formatPrice(payment ? payment.amountKopecks/100 : order.total)}</Text>
        {payment?.receiptEmail&&<Text variant="caption">Email для чека: {payment.receiptEmail}</Text>}
      </Card>
      {paid?<Button label="Открыть QR заказа" onPress={() => router.replace({pathname:'/ticket/[id]',params:{id}})}/>:review?<Text variant="body" tone="danger">Банк подтвердил оплату после завершения резерва. Не оплачивайте повторно — обратитесь к администратору, назвав номер заказа.</Text>:order.status==='pending'?<>
        {!payment&&<Button label="Подготовить тестовую оплату" loading={busy} onPress={() => void start()}/>}
        {payment?.confirmationUrl&&<Button label="Открыть страницу Альфа-Банка" onPress={() => void Linking.openURL(payment.confirmationUrl!).catch(() => setError('Не удалось открыть страницу банка'))}/>}
        <Button label="Проверить оплату" variant="outline" onPress={() => void check()}/>
        <Text variant="caption" tone="muted">СБП должен быть подключён банком для вашего тестового магазина. Статус сверяет сервер; возврат на эту страницу не означает успешную оплату.</Text>
      </>:<Text variant="body" tone="danger">Резерв завершён или заказ отменён. Новую оплату не начинайте.</Text>}
    </>}
    {!!error&&<Text variant="body" tone="danger">{error}</Text>}
    <Text variant="caption" tone="muted">Фискализация пока не подключена. Этот экран и состав заказа не являются кассовым чеком. Электронный чек будет формировать подключённая ККТ.</Text>
  </View></Screen>;
}
const styles=StyleSheet.create({content:{gap:spacing.lg,paddingBottom:spacing.xl},row:{flexDirection:'row',justifyContent:'space-between',gap:spacing.lg,flexWrap:'wrap'}});
