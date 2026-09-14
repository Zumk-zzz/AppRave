import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Chip, ChipRow, Screen, Stepper, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatEventDate, pluralWithCount } from '@/src/lib/format';
import {
  describe,
  isPositive,
  judgeScan,
  VERDICT_HINT,
  VERDICT_TITLE,
  type ScanSummary,
} from '@/src/lib/ticket';
import { useCatalogStore } from '@/src/store/catalog';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

/** Пауза после срабатывания: иначе камера шлёт один и тот же код десятки раз в секунду. */
const RESCAN_DELAY = 2000;

export default function AdminScan() {
  const [permission, requestPermission] = useCameraPermissions();

  const events = useCatalogStore((s) => s.events);
  const orders = useOrdersStore((s) => s.orders);
  const redeemEntry = useOrdersStore((s) => s.redeemEntry);
  const redeemLine = useOrdersStore((s) => s.redeemLine);

  const [eventId, setEventId] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanSummary | null>(null);
  /** Сколько штук каждой позиции бара админ собирается выдать прямо сейчас */
  const [issuing, setIssuing] = useState<Record<number, number>>({});
  const locked = useRef(false);

  const upcoming = useMemo(
    () => [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [events],
  );

  useEffect(() => {
    setEventId((current) => current ?? upcoming[0]?.id ?? null);
  }, [upcoming]);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (locked.current) return;
      locked.current = true;

      const result = judgeScan(data, orders, eventId ?? undefined);
      setScan(result);
      // По умолчанию предлагаем выдать всё, что осталось — обычный случай
      setIssuing(Object.fromEntries(result.bar.map((b) => [b.lineIndex, b.left])));

      Haptics.notificationAsync(
        isPositive(result.verdict)
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );

      setTimeout(() => {
        locked.current = false;
      }, RESCAN_DELAY);
    },
    [orders, eventId],
  );

  /** Пересобирает карточку после погашения, не требуя повторного сканирования. */
  const refresh = useCallback(
    (orderId: string) => {
      const fresh = useOrdersStore.getState().orders.find((o) => o.id === orderId);
      if (!fresh) return;

      const parts = describe(fresh);
      const hasLeft = parts.entry.left > 0 || parts.bar.some((b) => b.left > 0);

      setScan({ ...parts, order: fresh, verdict: hasLeft ? 'ok' : 'nothing-left' });
      setIssuing(Object.fromEntries(parts.bar.map((b) => [b.lineIndex, b.left])));
    },
    [],
  );

  const handleEntry = () => {
    if (!scan?.order) return;
    if (redeemEntry(scan.order.id)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh(scan.order.id);
    }
  };

  const handleIssue = (lineIndex: number) => {
    if (!scan?.order) return;
    const count = issuing[lineIndex] ?? 0;
    if (count <= 0) return;

    if (redeemLine(scan.order.id, lineIndex, count)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh(scan.order.id);
    }
  };

  const handleIssueAll = () => {
    if (!scan?.order) return;
    let any = false;

    for (const position of scan.bar) {
      const count = issuing[position.lineIndex] ?? 0;
      if (count > 0 && redeemLine(scan.order.id, position.lineIndex, count)) any = true;
    }

    if (any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh(scan.order.id);
    }
  };

  if (!permission) {
    return (
      <Screen>
        <AdminHeader title="Сканер" subtitle="Контроль на входе и у бара" />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <AdminHeader title="Сканер" subtitle="Контроль на входе и у бара" />
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
  const barPending = scan?.bar.filter((b) => b.left > 0) ?? [];

  return (
    <Screen scroll padded={false}>
      <View style={styles.padded}>
        <AdminHeader title="Сканер" subtitle="Контроль на входе и у бара" />
      </View>

      <ChipRow>
        {upcoming.map((e) => (
          <Chip
            key={e.id}
            label={e.title}
            selected={e.id === eventId}
            onPress={() => {
              setEventId(e.id);
              setScan(null);
            }}
          />
        ))}
      </ChipRow>

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
              {scan.order && <Badge label={scan.order.id} tone="neutral" />}
            </View>

            <Text variant="caption" tone="muted">
              {VERDICT_HINT[scan.verdict]}
            </Text>

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
            {scan.verdict === 'ok' && (
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
                      <View key={position.lineIndex} style={styles.barRow}>
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
                            value={issuing[position.lineIndex] ?? 0}
                            onChange={(next) =>
                              setIssuing((s) => ({ ...s, [position.lineIndex]: next }))
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
