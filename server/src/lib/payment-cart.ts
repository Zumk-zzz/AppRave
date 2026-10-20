import { conflict } from './http-error.js';

type Line = { id: string; title: string; kind: string; priceKopecks: number; qty: number; cancelledQty: number; redeemed: number; discountKopecks?: number };
/** Снимок корзины в целых копейках; клиентские цены сюда не попадают. */
export function paymentCart(lines: Line[]) {
  const items = lines.filter((line) => line.qty > line.cancelledQty).map((line) => {
    const qty = line.qty - line.cancelledQty;
    const discountKopecks=line.discountKopecks??0;
    const amountKopecks = line.priceKopecks * qty-discountKopecks;
    if (![qty, line.priceKopecks, amountKopecks].every(Number.isSafeInteger) || qty <= 0 || !Number.isSafeInteger(discountKopecks) || discountKopecks<0 || amountKopecks<0 || line.priceKopecks < 0 || line.redeemed > 0) {
      throw conflict('Заказ нельзя передать на оплату', 'invalid_payment_cart');
    }
    return { id: line.id, name: line.title, kind: line.kind, qty, priceKopecks: line.priceKopecks, discountKopecks, amountKopecks };
  });
  const amountKopecks = items.reduce((sum, item) => sum + item.amountKopecks, 0);
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0 || amountKopecks > 2147483647) throw conflict('Проверьте сумму заказа', 'invalid_payment_amount');
  return { currency: 'RUB' as const, amountKopecks, items };
}
