import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Sheet, Text } from '@/src/components';
import { plural, pluralWithCount } from '@/src/lib/format';
import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';

export function GuestListSheet({
  visible,
  onClose,
  guests,
  onChange,
  seats,
}: {
  visible: boolean;
  onClose: () => void;
  guests: string[];
  onChange: (next: string[]) => void;
  /** Вместимость стола: одно место занимает сам владелец брони */
  seats: number;
}) {
  const [draft, setDraft] = useState('');

  const maxGuests = Math.max(0, seats - 1);
  const isFull = guests.length >= maxGuests;
  const trimmed = draft.trim();
  const isDuplicate = guests.some((g) => g.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length > 0 && !isFull && !isDuplicate;

  const addGuest = () => {
    if (!canAdd) return;
    Haptics.selectionAsync();
    onChange([...guests, trimmed]);
    setDraft('');
  };

  const removeGuest = (name: string) => {
    Haptics.selectionAsync();
    onChange(guests.filter((g) => g !== name));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Гостевой список">
      <Text variant="body" tone="muted" style={styles.lead}>
        Имена попадут на фейс-контроль — гости пройдут без вас.
        Свободно {pluralWithCount(maxGuests - guests.length, 'место', 'места', 'мест')} из {maxGuests}.
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={isFull ? 'Все места заняты' : 'Имя и фамилия'}
          placeholderTextColor={colors.textFaint}
          editable={!isFull}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={addGuest}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить гостя"
          disabled={!canAdd}
          onPress={addGuest}
          style={({ pressed }) => [
            styles.addButton,
            !canAdd && styles.addButtonDisabled,
            pressed && canAdd && styles.addButtonPressed,
          ]}
        >
          <Ionicons name="add" size={22} color={canAdd ? colors.onAccent : colors.textFaint} />
        </Pressable>
      </View>

      {isDuplicate && trimmed.length > 0 && (
        <Text variant="caption" tone="danger" style={styles.hint}>
          Такой гость уже в списке
        </Text>
      )}

      {guests.length === 0 ? (
        <Text variant="caption" tone="faint" style={styles.empty}>
          Пока никого. Можно добавить позже — до начала вечеринки.
        </Text>
      ) : (
        <View style={styles.guests}>
          {guests.map((name, i) => (
            <View key={name} style={styles.guestRow}>
              <View style={styles.guestNum}>
                <Text style={styles.guestNumText}>{i + 1}</Text>
              </View>
              <Text variant="body" style={styles.guestName} numberOfLines={1}>
                {name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Убрать ${name}`}
                hitSlop={10}
                onPress={() => removeGuest(name)}
              >
                <Ionicons name="close" size={18} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Button
        label={
          guests.length > 0
            ? `Готово · ${guests.length} ${plural(guests.length, 'гость', 'гостя', 'гостей')}`
            : 'Готово'
        }
        size="lg"
        fullWidth
        onPress={onClose}
        style={styles.done}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lead: {
    marginBottom: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  addButtonDisabled: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addButtonPressed: {
    opacity: 0.8,
  },
  hint: {
    marginTop: spacing.sm,
  },
  empty: {
    marginTop: spacing.lg,
  },
  guests: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  guestNum: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestNumText: {
    fontFamily: fonts.bodySemi,
    fontSize: fontSize.xs,
    lineHeight: 22,
    color: colors.textMuted,
  },
  guestName: {
    flex: 1,
  },
  done: {
    marginTop: spacing.xl,
  },
});
