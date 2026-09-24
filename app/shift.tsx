import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Field, Screen, SectionHeader, Sheet, Text } from '@/src/components';
import { ROLE_LABEL } from '@/src/lib/permissions';
import { pluralWithCount } from '@/src/lib/format';
import { useAuthStore, useCan, useRole } from '@/src/store/auth';
import {
  ACTION_LABEL,
  useStaffStore,
  type StaffAction,
  type TeamShift,
} from '@/src/store/staff';
import { colors, radius, spacing } from '@/src/theme';

export default function ShiftScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const seesEveryone = useCan('orders:read');
  const role = useRole();

  const current = useStaffStore((s) => s.shift);
  const team = useStaffStore((s) => s.team);
  const actions = useStaffStore((s) => s.actions);
  const openShift = useStaffStore((s) => s.openShift);
  const closeShift = useStaffStore((s) => s.closeShift);
  const loadStaff = useStaffStore((s) => s.load);

  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');

  // Журнал перечитывается при каждом открытии: смена идёт прямо сейчас,
  // и вчерашний список в ней бесполезен
  useFocusEffect(
    useCallback(() => {
      void loadStaff(user);
    }, [loadStaff, user]),
  );

  // Смену открывает тот, кто работает в зале. Управляющий правит афишу
  // и днём, и без смены — ему она нужна только как наблюдение.
  const canStand = !!user?.staffRole;
  const onShiftNow = useMemo(() => team.filter((t) => !t.closedAt), [team]);

  /**
   * Что показывать в журнале.
   *
   * Разделение делает сервер: сотрудник получает только свои записи,
   * управляющий — все. Здесь остаётся только ограничить длину.
   */
  const visibleActions = useMemo(() => actions.slice(0, 100), [actions]);

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
    try {
      // Открытие и закрытие смены записывает в журнал тот, кто их исполняет
      await openShift(user);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
    }
  };

  const handleClose = async () => {
    try {
      await closeShift(user, note.trim() || undefined);
      setClosing(false);
      setNote('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
    }
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
            {user.name} · {ROLE_LABEL[role]}
          </Text>
        </View>
      </View>

      {canStand && (
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
      )}

      {/* Управляющему смену открывать незачем: ему нужно видеть чужие.
          Кто сейчас в зале — первое, на что он смотрит. */}
      {seesEveryone && (
        <>
          <SectionHeader
            title="Смены команды"
            kicker={onShiftNow.length > 0 ? `Сейчас в зале: ${onShiftNow.length}` : 'Сейчас никого'}
          />

          {team.length === 0 ? (
            <Text variant="caption" tone="faint" style={styles.empty}>
              Смен пока не было.
            </Text>
          ) : (
            <View style={styles.log}>
              {team.map((shift) => (
                <ShiftRow key={shift.id} shift={shift} />
              ))}
            </View>
          )}
        </>
      )}

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

/**
 * Смена сотрудника в списке управляющего.
 *
 * Открытые видно сразу по метке: когда в клубе что-то происходит,
 * первый вопрос — кто сейчас на входе.
 */
function ShiftRow({ shift }: { shift: TeamShift }) {
  const open = !shift.closedAt;

  return (
    <View style={styles.teamRow}>
      <View style={styles.flex}>
        <Text variant="body">{shift.staff.name}</Text>
        <Text variant="caption" tone="faint">
          {ROLE_LABEL[shift.staff.role]} ·{' '}
          {format(new Date(shift.openedAt), 'd MMM, HH:mm', { locale: ru })}
          {shift.closedAt ? ` — ${format(new Date(shift.closedAt), 'HH:mm', { locale: ru })}` : ''}
        </Text>
        {shift.note && (
          <Text variant="caption" tone="muted">
            {shift.note}
          </Text>
        )}
      </View>

      <View style={styles.teamMeta}>
        {open ? (
          <Badge label="В зале" tone="success" />
        ) : (
          <Text variant="caption" tone="faint">
            {pluralWithCount(shift.actions, 'действие', 'действия', 'действий')}
          </Text>
        )}
      </View>
    </View>
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
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  teamMeta: {
    alignItems: 'flex-end',
  },
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
