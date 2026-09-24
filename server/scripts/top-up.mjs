/**
 * Пополнение запасов перед проверками.
 *
 * Наборы гоняются по одной и той же базе десятки раз и каждый раз
 * что-то покупают. Без пополнения они однажды падают не потому, что
 * что-то сломалось, а потому, что кончился коктейль или билеты, —
 * и такому набору перестаёшь верить раньше, чем он найдёт настоящую
 * ошибку. Пополняем теми же ручками, которыми пользуется администратор.
 */

/** Довести остаток позиции бара до запаса, которого точно хватит. */
export async function topUpStock(api, token, barItemId, spare = 50) {
  await api('/stock/moves', {
    method: 'POST',
    token,
    body: { barItemId, kind: 'receipt', delta: spare, comment: 'Подготовка проверки' },
  });
}

/**
 * Довести тираж типа билета так, чтобы свободных было не меньше spare.
 *
 * Правим тираж, а не проданное: это ровно то, что делает администратор,
 * когда решает выпустить ещё билетов.
 */
export async function topUpTickets(api, token, eventId, typeId, spare = 20) {
  const event = (await api(`/events/${eventId}`, { token })).body;
  const type = event.tickets.find((t) => t.id === typeId);
  if (!type || type.available >= spare) return;

  await api(`/admin/events/${eventId}`, {
    method: 'PUT',
    token,
    body: {
      title: event.title,
      subtitle: event.subtitle,
      date: event.date,
      genre: event.genre,
      ageLimit: event.ageLimit,
      lineup: event.lineup,
      description: event.description,
      cover: event.cover,
      status: event.status,
      tickets: event.tickets.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        priceKopecks: t.priceKopecks,
        quantity: t.id === typeId ? t.quantity + (spare - t.available) : t.quantity,
      })),
    },
  });
}
