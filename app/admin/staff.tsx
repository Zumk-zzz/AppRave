import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Field, Screen, SectionHeader, Segmented, Sheet, Text } from '@/src/components';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatContact } from '@/src/lib/contact';
import { extractDigits, formatPhone, isPhoneComplete, toE164 } from '@/src/lib/phone';
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  type UserRole,
} from '@/src/lib/permissions';
import { STAFF_PHONES } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { useStaffStore } from '@/src/store/staff';
import { colors, spacing } from '@/src/theme';

export default function AdminStaff() {
  const me = useAuthStore((s) => s.user);
  const members = useStaffStore((s) => s.members);
  const addMember = useStaffStore((s) => s.addMember);
  const removeMember = useStaffStore((s) => s.removeMember);

  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('bartender');
  const [saving, setSaving] = useState(false);

  const canSave = isPhoneComplete(digits) && name.trim().length > 0;

  const handleAdd = async () => {
    if (!canSave || !me) return;

    setSaving(true);

    try {
      // Выдачу роли записывает в журнал тот, кто её исполняет
      await addMember({ contact: toE164(digits), name: name.trim(), role });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOpen(false);
      setDigits('');
      setName('');
      setRole('bartender');
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (id: string, memberName: string) => {
    Alert.alert('Отозвать роль?', `${memberName} станет обычным гостем и потеряет доступ.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отозвать',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeMember(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            // Себя разжаловать нельзя: иначе выдать роли станет некому
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
          }
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
                    {formatContact(m.contact)}
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
                onPress={() => handleRemove(m.id, m.name)}
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
