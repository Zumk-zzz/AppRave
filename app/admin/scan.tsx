import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Chip, ChipRow, Screen, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatEventDate, formatPrice, pluralWithCount } from '@/src/lib/format';
import { judgeScan, VERDICT_HINT, VERDICT_TITLE, type ScanResult } from '@/src/lib/ticket';
import { useCatalogStore } from '@/src/store/catalog';
import { useOrdersStore } from '@/src/store/orders';
import { colors, radius, spacing } from '@/src/theme';

/** Пауза после срабатывания: иначе камера шлёт один и тот же код десятки раз в секунду. */
const RESCAN_DELAY = 2000;

export default function AdminScan() {
  const [permission, requestPermission] = useCameraPermissions();

  const events = useCatalogStore((s) => s.events);
  const orders = useOrdersStore((s) => s.orders);
  const markUsed = useOrdersStore((s) => s.markUsed);

  const [eventId, setEventId] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
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

      const verdict = judgeScan(data, orders, eventId ?? undefined);
      setResult(verdict);

      Haptics.notificationAsync(
        verdict.verdict === 'ok'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );

      setTimeout(() => {
        locked.current = false;
      }, RESCAN_DELAY);
    },
    [orders, eventId],
  );

  const handleAdmit = () => {
    if (!result?.order) return;
    markUsed(result.order.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setResult(null);
  };

  if (!permission) {
    return (
      <Screen>
        <AdminHeader title="Сканер" subtitle="Контроль на входе" />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <AdminHeader title="Сканер" subtitle="Контроль на входе" />
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={40} color={colors.textFaint} />
          <Text variant="body" tone="muted" style={styles.center}>
            Чтобы проверять билеты, нужен доступ к камере
          </Text>
          <Button label="Разрешить камеру" onPress={requestPermission} />
        </View>
      </Screen>
    );
  }

  const guestCount = result?.order
    ? result.order.lines.filter((l) => l.kind === 'ticket').reduce((n, l) => n + l.qty, 0)
    : 0;

  return (
    <Screen scroll padded={false}>
      <View style={styles.padded}>
        <AdminHeader title="Сканер" subtitle="Контроль на входе" />
      </View>

      <ChipRow>
        {upcoming.map((e) => (
          <Chip
            key={e.id}
            label={e.title}
            selected={e.id === eventId}
            onPress={() => {
              setEventId(e.id);
              setResult(null);
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

        {result && (
          <Card
            elevated
            style={[styles.result, result.verdict === 'ok' ? styles.resultOk : styles.resultBad]}
          >
            <View style={styles.resultHead}>
              <Ionicons
                name={result.verdict === 'ok' ? 'checkmark-circle' : 'close-circle'}
                size={26}
                color={result.verdict === 'ok' ? colors.success : colors.danger}
              />
              <Text variant="subtitle" style={styles.flex}>
                {VERDICT_TITLE[result.verdict]}
              </Text>
            </View>

            <Text variant="caption" tone="muted">
              {VERDICT_HINT[result.verdict]}
            </Text>

            {result.order && (
              <View style={styles.orderBox}>
                <View style={styles.orderRow}>
                  <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                    {result.order.eventTitle ?? 'Заказ'}
                  </Text>
                  <Badge label={result.order.id} tone="neutral" />
                </View>

                {result.order.eventDate && (
                  <Text variant="caption" tone="faint">
                    {formatEventDate(new Date(result.order.eventDate))}
                  </Text>
                )}

                <Text variant="caption" tone="muted">
                  {guestCount > 0
                    ? pluralWithCount(guestCount, 'билет', 'билета', 'билетов')
                    : 'Без билетов'}
                  {' · '}
                  {formatPrice(result.order.total)}
                </Text>

                {result.order.lines
                  .filter((l) => l.kind === 'table')
                  .map((l, i) => (
                    <Text key={i} variant="caption" tone="accent">
                      {l.title}
                      {l.guests && l.guests.length > 0 ? ` · ${l.guests.join(', ')}` : ''}
                    </Text>
                  ))}
              </View>
            )}

            {result.verdict === 'ok' ? (
              <Button label="Отметить проход" size="lg" fullWidth onPress={handleAdmit} />
            ) : (
              <Button
                label="Сканировать дальше"
                variant="surface"
                fullWidth
                onPress={() => setResult(null)}
              />
            )}
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
  orderBox: {
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  orderRow: {
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
