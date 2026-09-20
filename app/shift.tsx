import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Field, Screen, SectionHeader, Sheet, Text } from '@/src/components';
import { ROLE_LABEL } from '@/src/lib/permissions';
import { useAuthStore, useCan } from '@/src/store/auth';
import { ACTION_LABEL, useStaffStore, type StaffAction } from '@/src/store/staff';
import { colors, radius, spacing } from '@/src/theme';

export default function ShiftScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const seesEveryone = useCan('orders:read');

  const shifts = useStaffStore((s) => s.shifts);
  const actions = useStaffStore((s) => s.actions);
  const openShift = useStaffStore((s) => s.openShift);
  const closeShift = useStaffStore((s) => s.closeShift);

  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');

  const current = useMemo(
    () => shifts.find((s) => s.userId === user?.id && !s.closedAt),
    [shifts, user?.id],
  );

  /** Свои действия за смену, а у управляющих — действия всей команды. */
  const visibleActions = useMemo(() => {
    if (seesEveryone) return actions.slice(0, 100);
    return actions.filter((a) => a.actorId === user?.id).slice(0, 100);
  }, [actions, seesEveryone, user?.id]);

  const shiftActions = current ? actions.filter((a) => a.shiftId === current.id) : [];

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of shiftActions) {
      counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
    }
    return counts;
  }, [shiftActions]);

  if (!user) return null;

  const handleOpen = async () => {
    await openShift({ id: user.id, name: user.name });
    useStaffStore.getState().log({
      kind: 'shift_opened',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleClose = async () => {
    useStaffStore.getState().log({
      kind: 'shift_closed',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      summary: note.trim() || undefined,
    });
    await closeShift(user.id, note.trim() || undefined);
    setClosing(false);
    setNote('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textMuted} />
        </Pressable>
        <View style={styles.flex}>
          <Text variant="title">Смена</Text>
          <Text variant="caption" tone="muted">
            {user.name} · {ROLE_LABEL[user.role]}
          </Text>
        </View>
      </View>

      <Card style={styles.shiftCard}>
        {current ? (
          <>
            <View style={styles.shiftHead}>
              <View style={styles.flex}>
                <Text variant="bodyStrong">Смена открыта</Text>
                <Text variant="caption" tone="muted">
                  с {format(new Date(current.openedAt), 'd MMMM, HH:mm', { locale: ru })}
                </Text>
              </View>
              <Badge label="В работе" tone="success" />
            </View>

            {summary.size > 0 && (
              <View style={styles.summary}>
                {[...summary.entries()].map(([kind, count]) => (
                  <View key={kind} style={styles.summaryRow}>
                    <Text variant="caption" tone="muted" style={styles.flex}>
                      {ACTION_LABEL[kind as keyof typeof ACTION_LABEL]}
                    </Text>
                    <Text variant="caption" tone="accent">
                      {count}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Button label="Закрыть смену" variant="outline" fullWidth onPress={() => setClosing(true)} />
          </>
        ) : (
          <>
            <Text variant="bodyStrong">Смена не открыта</Text>
            <Text variant="caption" tone="muted">
              Действия всё равно записываются, но без привязки к смене — итоги
              за ночь тогда не сойдутся.
            </Text>
            <Button label="Открыть смену" size="lg" fullWidth onPress={handleOpen} />
          </>
        )}
      </Card>

      <SectionHeader
        title="Журнал"
        kicker={seesEveryone ? 'Действия всей команды' : 'Ваши действия'}
      />

      {visibleActions.length === 0 ? (
        <Text variant="caption" tone="faint" style={styles.empty}>
          Пока пусто. Здесь появятся проходы и выдачи.
        </Text>
      ) : (
        <View style={styles.log}>
          {visibleActions.map((action) => (
            <ActionRow key={action.id} action={action} showActor={seesEveryone} />
          ))}
        </View>
      )}

      <Sheet visible={closing} onClose={() => setClosing(false)} title="Закрыть смену">
        <View style={styles.sheet}>
          <Text variant="body" tone="muted">
            За смену: {pluralActions(shiftActions.length)}.
          </Text>
          <Field
            label="Заметка"
            value={note}
            onChangeText={setNote}
            placeholder="Расхождения, происшествия"
            multiline
            hint="Необязательно, но помогает разобраться потом"
          />
          <Button label="Закрыть смену" size="lg" fullWidth onPress={handleClose} />
        </View>
      </Sheet>
    </Screen>
  );
}

function ActionRow({ action, showActor }: { action: StaffAction; showActor: boolean }) {
  const isManual = action.kind === 'entry_manual';

  return (
    <Card style={styles.actionRow}>
      <View style={styles.flex}>
        <Text variant="body" numberOfLines={1}>
          {ACTION_LABEL[action.kind]}
          {action.summary ? ` · ${action.summary}` : ''}
        </Text>
        <Text variant="caption" tone="faint">
          {format(new Date(action.createdAt), 'd MMM, HH:mm', { locale: ru })}
          {action.orderId ? ` · ${action.orderId}` : ''}
          {showActor ? ` · ${action.actorName}` : ''}
        </Text>
      </View>

      {/* Ручной пропуск выделяем: он обходит проверку кода и требует доверия */}
      {isManual && <Badge label="Вручную" tone="gold" />}
    </Card>
  );
}

function pluralActions(n: number): string {
  const forms = ['действие', 'действия', 'действий'];
  const mod10 = n % 10;
  const mod100 = n % 100;
  const form =
    mod10 === 1 && mod100 !== 11
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
        ? forms[1]
        : forms[2];
  return `${n} ${form}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shiftCard: {
    gap: spacing.md,
  },
  shiftHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summary: {
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  log: {
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  empty: {
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
  sheet: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
