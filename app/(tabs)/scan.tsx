import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, Stepper, Text } from '@/src/components';
import { nearestEvent } from '@/src/lib/events';
import { formatEventDate, pluralWithCount } from '@/src/lib/format';
import {
  describe,
  isPositive,
  judgeOrder,
  parseQrPayload,
  VERDICT_HINT,
  VERDICT_TITLE,
  type ScanSummary,
} from '@/src/lib/ticket';
import type { Order } from '@/src/services';
import { useCan } from '@/src/store/auth';
import { useCatalogStore } from '@/src/store/catalog';
import { useOrdersStore } from '@/src/store/orders';
import { useStaffStore } from '@/src/store/staff';
import { colors, radius, spacing } from '@/src/theme';

/** Пауза после срабатывания: иначе камера шлёт один и тот же код десятки раз в секунду. */
const RESCAN_DELAY = 2000;

/** Шапка вкладки: подписывает, что именно доступно этой роли. */
function ScanHeader() {
  const canEntry = useCan('scan:entry');
  const canBar = useCan('scan:bar');

  const subtitle =
    canEntry && canBar ? 'Вход и бар' : canEntry ? 'Контроль на входе' : 'Выдача напитков';

  return (
    <View style={styles.headerBlock}>
      <Text variant="label" tone="accent">
        {subtitle}
      </Text>
      <Text variant="display">Сканер</Text>
    </View>
  );
}

export default function AdminScan() {
  const [permission, requestPermission] = useCameraPermissions();

  const events = useCatalogStore((s) => s.events);
  const findOrder = useOrdersStore((s) => s.byNumber);
  const admit = useOrdersStore((s) => s.admit);
  const issue = useOrdersStore((s) => s.issue);
  const bans = useStaffStore((s) => s.bans);

  const [scan, setScan] = useState<ScanSummary | null>(null);
  /** Сколько штук каждой позиции бара сотрудник собирается выдать прямо сейчас */
  const [issuing, setIssuing] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  /**
   * Вечеринка, которую обслуживают прямо сейчас.
   *
   * Раньше её выбирали из списка. На входе это лишний шаг и источник
   * ошибок: выбрал соседнюю строку — и каждый код показывает «другая
   * вечеринка». Клуб работает одной ночью, и определить её можно самим.
   */
  const current = useMemo(() => nearestEvent(events), [events]);
  const eventId = current?.id ?? null;

  /** Показывает вердикт и заранее подставляет «выдать всё, что осталось». */
  const show = useCallback((result: ScanSummary) => {
    setScan(result);
    setIssuing(Object.fromEntries(result.bar.map((b) => [b.lineId, b.left])));

    Haptics.notificationAsync(
      isPositive(result.verdict)
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
  }, []);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (locked.current) return;
      locked.current = true;

      void (async () => {
        const parsed = parseQrPayload(data);

        if (!parsed) {
          show({ verdict: 'foreign', entry: { total: 0, left: 0 }, bar: [] });
        } else {
          // Заказ ищется на сервере: чужая покупка на телефоне сотрудника
          // взяться не может. В автономном режиме поиск идёт по своим.
          const order = await findOrder(parsed.number).catch(() => null);
          show(judgeOrder(order, eventId ?? undefined));
        }

        setTimeout(() => {
          locked.current = false;
        }, RESCAN_DELAY);
      })();
    },
    [findOrder, eventId, show],
  );

  /** Пересобирает карточку после выдачи, не требуя повторного сканирования. */
  const refresh = useCallback((fresh: Order) => {
    const parts = describe(fresh);
    const hasLeft = parts.entry.left > 0 || parts.bar.some((b) => b.left > 0);

    setScan({ ...parts, order: fresh, verdict: hasLeft ? 'ok' : 'nothing-left' });
    setIssuing(Object.fromEntries(parts.bar.map((b) => [b.lineId, b.left])));
  }, []);

  /**
   * Одно действие за раз.
   *
   * Отказ сервера показываем словами: «нельзя» без причины на входе
   * бесполезно, сотруднику нужно знать — заказ отменён или гость уже прошёл.
   */
  const run = async (action: () => Promise<Order>) => {
    if (busy) return;
    setBusy(true);

    try {
      refresh(await action());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  };

  const handleEntry = () => {
    const order = scan?.order;
    if (!order) return;
    void run(() => admit(order));
  };

  const handleIssueAll = () => {
    const order = scan?.order;
    const positions = scan?.bar ?? [];
    if (!order) return;

    void run(async () => {
      let fresh = order;

      // Позиции выдаются по одной: у сервера операция на строку, и при
      // обрыве связи выданным числится ровно то, что успели отдать
      for (const position of positions) {
        const count = issuing[position.lineId] ?? 0;
        if (count > 0) fresh = await issue(fresh, position.lineId, count);
      }

      return fresh;
    });
  };

  if (!permission) {
    return (
      <Screen>
        <ScanHeader />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <ScanHeader />
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={40} color={colors.textFaint} />
          <Text variant="body" tone="muted" style={styles.center}>
            Чтобы проверять коды, нужен доступ к камере
          </Text>
          <Button label="Разрешить камеру" onPress={requestPermission} />
        </View>
      </Screen>
    );
  }

  const orderEvent = scan?.order ? events.find((e) => e.id === scan.order?.eventId) : undefined;

  // Владелец кода определяется по номеру карты внутри QR
  const holder = scan?.order?.qrPayload.split('|')[2];
  const ban = holder ? bans.find((b) => b.contact === holder && !b.liftedAt) : undefined;
  const barPending = scan?.bar.filter((b) => b.left > 0) ?? [];

  return (
    <Screen scroll padded={false}>
      <View style={styles.padded}>
        <ScanHeader />
      </View>

      <View style={styles.padded}>
        <Text variant="caption" tone={current ? 'muted' : 'danger'}>
          {current
            ? `Смена: ${current.title} · ${formatEventDate(new Date(current.date))}`
            : 'Ближайшей вечеринки нет — коды не с чем сверять'}
        </Text>
      </View>

      <View style={[styles.padded, styles.cameraWrap]}>
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
          <View style={styles.frame} pointerEvents="none" />
        </View>

        <Text variant="caption" tone="faint" style={styles.center}>
          Наведите на QR из приложения гостя
        </Text>

        {scan && (
          <Card
            elevated
            style={[styles.result, isPositive(scan.verdict) ? styles.resultOk : styles.resultBad]}
          >
            <View style={styles.resultHead}>
              <Ionicons
                name={isPositive(scan.verdict) ? 'checkmark-circle' : 'alert-circle'}
                size={26}
                color={isPositive(scan.verdict) ? colors.success : colors.danger}
              />
              <Text variant="subtitle" style={styles.flex}>
                {VERDICT_TITLE[scan.verdict]}
              </Text>
              {scan.order && <Badge label={scan.order.number} tone="neutral" />}
            </View>

            <Text variant="caption" tone="muted">
              {VERDICT_HINT[scan.verdict]}
            </Text>

            {/* Отказ показывается раньше всех действий и крупно: когда
                на входе очередь, эту информацию нельзя прятать */}
            {ban && (
              <View style={styles.banBlock}>
                <Ionicons name="hand-left" size={20} color={colors.danger} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" tone="danger">
                    Отказ во входе
                  </Text>
                  <Text variant="caption" tone="muted">
                    {ban.reason}
                  </Text>
                </View>
              </View>
            )}

            {/* На какую вечеринку оформлен заказ — важно при вердикте wrong-event */}
            {scan.order && (
              <Text variant="caption" tone={scan.verdict === 'wrong-event' ? 'danger' : 'faint'}>
                {orderEvent?.title ?? scan.order.eventTitle ?? 'Событие не указано'}
                {scan.order.eventDate
                  ? ` · ${formatEventDate(new Date(scan.order.eventDate))}`
                  : ''}
              </Text>
            )}

            {/* Действия доступны, только когда код подходит к выбранной вечеринке */}
            {scan.verdict === 'ok' && !ban && (
              <>
                {scan.entry.total > 0 && (
                  <View style={styles.block}>
                    <View style={styles.blockHead}>
                      <Ionicons name="enter-outline" size={18} color={colors.accent} />
                      <Text variant="bodyStrong" style={styles.flex}>
                        Проход
                      </Text>
                      <Badge
                        label={
                          scan.entry.left > 0
                            ? pluralWithCount(scan.entry.left, 'гость', 'гостя', 'гостей')
                            : 'Прошли'
                        }
                        tone={scan.entry.left > 0 ? 'accent' : 'success'}
                      />
                    </View>

                    {scan.entry.left > 0 ? (
                      <Button
                        label={`Пропустить ${pluralWithCount(scan.entry.left, 'гостя', 'гостей', 'гостей')}`}
                        size="lg"
                        fullWidth
                        onPress={handleEntry}
                      />
                    ) : (
                      <Text variant="caption" tone="faint">
                        Все {scan.entry.total} уже прошли
                      </Text>
                    )}
                  </View>
                )}

                {scan.bar.length > 0 && (
                  <View style={styles.block}>
                    <View style={styles.blockHead}>
                      <Ionicons name="wine-outline" size={18} color={colors.accent} />
                      <Text variant="bodyStrong" style={styles.flex}>
                        Бар
                      </Text>
                      {barPending.length === 0 && <Badge label="Выдано" tone="success" />}
                    </View>

                    {scan.bar.map((position) => (
                      <View key={position.lineId} style={styles.barRow}>
                        <View style={styles.flex}>
                          <Text variant="body" numberOfLines={1}>
                            {position.title}
                          </Text>
                          <Text
                            variant="caption"
                            tone={position.left > 0 ? 'muted' : 'faint'}
                          >
                            {position.left > 0
                              ? `Осталось выдать ${position.left} из ${position.qty}`
                              : `Выдано полностью (${position.qty})`}
                          </Text>
                        </View>

                        {position.left > 0 && (
                          <Stepper
                            value={issuing[position.lineId] ?? 0}
                            onChange={(next) =>
                              setIssuing((s) => ({ ...s, [position.lineId]: next }))
                            }
                            min={0}
                            max={position.left}
                          />
                        )}
                      </View>
                    ))}

                    {barPending.length > 0 && (
                      <Button
                        label="Выдать отмеченное"
                        size="lg"
                        fullWidth
                        onPress={handleIssueAll}
                      />
                    )}
                  </View>
                )}

                {scan.table && (
                  <View style={styles.block}>
                    <View style={styles.blockHead}>
                      <Ionicons name="grid-outline" size={18} color={colors.accent} />
                      <Text variant="bodyStrong" style={styles.flex}>
                        {scan.table.title}
                      </Text>
                    </View>
                    {scan.table.guests.length > 0 && (
                      <Text variant="caption" tone="muted">
                        Гости: {scan.table.guests.join(', ')}
                      </Text>
                    )}
                  </View>
                )}
              </>
            )}

            <Button
              label="Сканировать следующий"
              variant="surface"
              fullWidth
              onPress={() => setScan(null)}
            />
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  padded: {
    paddingHorizontal: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  cameraWrap: {
    marginTop: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  camera: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  frame: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    right: '15%',
    bottom: '15%',
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.md,
  },
  center: {
    textAlign: 'center',
  },
  result: {
    gap: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 2,
  },
  resultOk: {
    borderColor: colors.success,
  },
  resultBad: {
    borderColor: colors.danger,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  banBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
  },
  block: {
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});
