import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Field, Screen, SectionHeader, Segmented, Sheet, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { extractDigits, formatPhone, isPhoneComplete, toE164 } from '@/src/lib/phone';
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  type UserRole,
} from '@/src/lib/permissions';
import { STAFF_PHONES } from '@/src/services';
import { useAuthStore, useRole } from '@/src/store/auth';
import { useStaffStore } from '@/src/store/staff';
import { colors, spacing } from '@/src/theme';

export default function AdminStaff() {
  const me = useAuthStore((s) => s.user);
  const myRole = useRole();
  const members = useStaffStore((s) => s.members);
  const addMember = useStaffStore((s) => s.addMember);
  const removeMember = useStaffStore((s) => s.removeMember);
  const log = useStaffStore((s) => s.log);

  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('bartender');
  const [saving, setSaving] = useState(false);

  const canSave = isPhoneComplete(digits) && name.trim().length > 0;

  const handleAdd = async () => {
    if (!canSave || !me) return;

    setSaving(true);
    const phone = toE164(digits);

    await addMember({ phone, name: name.trim(), role });
    log({
      kind: 'role_granted',
      actorId: me.id,
      actorName: me.name,
      actorRole: myRole,
      summary: `${ROLE_LABEL[role]} · ${formatPhone(digits)}`,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    setOpen(false);
    setDigits('');
    setName('');
    setRole('bartender');
  };

  const handleRemove = (id: string, memberName: string, memberRole: UserRole) => {
    Alert.alert('Отозвать роль?', `${memberName} станет обычным гостем и потеряет доступ.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отозвать',
        style: 'destructive',
        onPress: async () => {
          await removeMember(id);
          if (me) {
            log({
              kind: 'role_revoked',
              actorId: me.id,
              actorName: me.name,
              actorRole: myRole,
              summary: `${ROLE_LABEL[memberRole]} · ${memberName}`,
            });
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <AdminHeader title="Сотрудники" subtitle={`${members.length} с ролями`} />

      <Button
        label="Добавить сотрудника"
        fullWidth
        icon={<Ionicons name="add" size={18} color={colors.onAccent} />}
        onPress={() => setOpen(true)}
        style={styles.add}
      />

      {members.length === 0 ? (
        <Text variant="body" tone="muted" style={styles.empty}>
          Пока никого. Добавьте бармена или фейс-контроль по номеру телефона.
        </Text>
      ) : (
        <View style={styles.list}>
          {members.map((m) => (
            <Card key={m.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{m.name}</Text>
                  <Text variant="caption" tone="muted">
                    {formatPhone(m.phone.replace(/^\+7/, ''))}
                  </Text>
                </View>
                <Badge label={ROLE_LABEL[m.role]} tone="accent" />
              </View>

              <Text variant="caption" tone="faint">
                {ROLE_DESCRIPTION[m.role]}
              </Text>

              <Button
                label="Отозвать роль"
                variant="ghost"
                fullWidth
                onPress={() => handleRemove(m.id, m.name, m.role)}
              />
            </Card>
          ))}
        </View>
      )}

      {/* Пока приложение на моках, роль выводится из номера при входе.
          Настоящая выдача заработает после подключения к API. */}
      <SectionHeader title="Демо-номера" kicker="Для проверки ролей" />
      <Card style={styles.demo}>
        {(Object.entries(STAFF_PHONES) as [string, UserRole][]).map(([phone, r]) => (
          <View key={phone} style={styles.demoRow}>
            <Text variant="body" style={styles.flex}>
              {formatPhone(phone.replace(/^\+7/, ''))}
            </Text>
            <Text variant="caption" tone="accent">
              {ROLE_LABEL[r]}
            </Text>
          </View>
        ))}
        <Text variant="caption" tone="faint">
          Код входа 0000. Любой другой номер входит гостем.
        </Text>
      </Card>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Новый сотрудник">
        <View style={styles.sheet}>
          <Field
            label="Имя"
            value={name}
            onChangeText={setName}
            placeholder="Иван Петров"
            autoCapitalize="words"
          />

          <Field
            label="Телефон"
            value={formatPhone(digits)}
            onChangeText={(text) => setDigits(extractDigits(text))}
            placeholder="+7 (___) ___-__-__"
            keyboardType="number-pad"
            hint="Роль выдаётся на номер: сотрудник получит её при первом входе"
          />

          <Segmented
            label="Роль"
            scrollable
            options={ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            value={role}
            onChange={setRole}
          />

          <Text variant="caption" tone="muted">
            {ROLE_DESCRIPTION[role]}
          </Text>

          <Button
            label="Добавить"
            size="lg"
            fullWidth
            disabled={!canSave}
            loading={saving}
            onPress={handleAdd}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: {
    marginBottom: spacing.xl,
  },
  list: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  card: {
    gap: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  demo: {
    gap: spacing.sm,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  sheet: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
