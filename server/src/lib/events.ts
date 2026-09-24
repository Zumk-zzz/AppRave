/**
 * Жизненный цикл вечеринки во времени.
 *
 * Дата начала — не граница: вечеринка начинается в 22:00 и заканчивается
 * под утро. Гость, купивший билет в полночь, приходит на идущую
 * вечеринку, а не на прошедшую, и афиша не должна прятать её у него
 * из-под рук в 22:01.
 */

/** Сколько вечеринка считается идущей после начала. */
export const EVENT_DURATION_HOURS = 8;

const HOUR = 3_600_000;

/** Момент, после которого вечеринка считается прошедшей. */
export function endOf(startsAt: Date): Date {
  return new Date(startsAt.getTime() + EVENT_DURATION_HOURS * HOUR);
}

/** Идёт или ещё впереди. */
export function isLive(startsAt: Date, now: Date = new Date()): boolean {
  return endOf(startsAt).getTime() > now.getTime();
}

/**
 * Условие Prisma «вечеринка ещё не прошла».
 *
 * Считаем от конца, а не от начала: иначе в афише пропадало бы то,
 * что происходит прямо сейчас.
 */
export function liveFilter(now: Date = new Date()) {
  return { startsAt: { gt: new Date(now.getTime() - EVENT_DURATION_HOURS * HOUR) } };
}
