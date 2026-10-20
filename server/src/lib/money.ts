/**
 * Деньги в копейках. Наружу отдаём тоже копейки, а не рубли:
 * любое деление на 100 в JSON — это шанс получить 1499.9999999.
 * Форматирует клиент, он и так это умеет.
 */
export const rub = (rubles: number): number => Math.round(rubles * 100);

export const TIER_RATE = { silver: 0.05, gold: 0.05, black: 0.05 } as const;

export type Tier = keyof typeof TIER_RATE;

export function pointsForPurchase(totalKopecks: number, _tier?: Tier): number {
  return Math.floor(totalKopecks / 2000);
}

export function tierForPoints(points: number): Tier {
  if (points >= 5000) return 'black';
  if (points >= 1000) return 'gold';
  return 'silver';
}
