import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  Button,
  Card,
  Field,
  NumberField,
  Screen,
  Segmented,
  Sheet,
  Text,
} from '@/src/components';
import { DEFAULT_COVER } from '@/src/data/covers';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { CoverPicker } from '@/src/features/admin/CoverPicker';
import { RefundSection } from '@/src/features/admin/RefundSection';
import { GENRE_LABEL } from '@/src/lib/events';
import { formatEventDate } from '@/src/lib/format';
import type { ClubEvent, Genre, TicketType } from '@/src/services';
import { useCatalogStore } from '@/src/store/catalog';
import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';

const GENRES: Genre[] = ['techno', 'house', 'hiphop', 'disco'];

function blankEvent(): ClubEvent {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 0, 0, 0);

  return {
    id: `ev_${Date.now()}`,
    title: '',
    subtitle: '',
    date: date.toISOString(),
    genre: 'techno',
    ageLimit: 18,
    lineup: [],
    description: '',
    cover: DEFAULT_COVER,
    status: 'published',
    tickets: [
      {
        id: 'tt_standard',
        name: 'Standard',
        description: 'Вход до 01:00',
        price: 1500,
        quantity: 50,
        available: 50,
      },
    ],
  };
}

const STATUS_HINT: Record<'draft' | 'published' | 'cancelled', string> = {
  published: 'Видна гостям, билеты продаются',
  draft: 'Готовится: гостям не видна, купить нельзя',
  cancelled: 'Отменена. Пропадает из афиши; деньги возвращаются отдельно',
};

/** Сколько уже продано: тираж минус остаток. */
function soldOf(ticket: TicketType): number {
  return Math.max(0, (ticket.quantity ?? ticket.available) - ticket.available);
}

export default function AdminEventForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const existing = useCatalogStore((s) => s.events.find((e) => e.id === id));
  const isNew = id === 'new';

  const [draft, setDraft] = useState<ClubEvent>(() =>
    existing ? structuredClone(existing) : blankEvent(),
  );
  const saveEvent = useCatalogStore((s) => s.saveEvent);
  const deleteEvent = useCatalogStore((s) => s.deleteEvent);

  const [dj, setDj] = useState('');
  const [saving, setSaving] = useState(false);
  // Возврат считается по тому, что записано, а не по тому, что на экране
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showError, setShowError] = useState(false);

  const patch = (part: Partial<ClubEvent>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...part }));
  };

  const titleError = draft.title.trim().length === 0 ? 'Без названия вечеринку не найдут' : null;
  const ticketsError = draft.tickets.length === 0 ? 'Нужен хотя бы один тип билета' : null;
  const canSave = !titleError && !ticketsError;

  const addDj = () => {
    const name = dj.trim();
    if (!name || draft.lineup.includes(name)) return;
    Haptics.selectionAsync();
    patch({ lineup: [...draft.lineup, name] });
    setDj('');
  };

  const patchTicket = (index: number, part: Partial<TicketType>) => {
    setDirty(true);
    setDraft((d) => ({
      ...d,
      tickets: d.tickets.map((t, i) => (i === index ? { ...t, ...part } : t)),
    }));
  };

  const addTicket = () => {
    Haptics.selectionAsync();
    setDraft((d) => ({
      ...d,
      tickets: [
        ...d.tickets,
        {
          // Идентификатор уникален внутри события — он же ключ строки корзины
          id: `tt_${Date.now()}`,
          name: '',
          description: '',
          price: 1000,
          quantity: 30,
          available: 30,
        },
      ],
    }));
  };

  const handleSave = async () => {
    if (!canSave) {
      setShowError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setSaving(true);
    try {
      await saveEvent(draft, isNew);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDirty(false);

      // Отменённая вечеринка остаётся открытой: сразу после отмены
      // администратору нужен возврат, а он тут же, ниже по экрану
      if (draft.status !== 'cancelled') router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Удалить вечеринку?',
      'Уже купленные билеты останутся у гостей, но событие пропадёт из афиши.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEvent(draft.id);
              router.back();
            } catch (e) {
              // По вечеринке с заказами удаление запрещено: у гостей на
              // руках билеты, и без события в них не останется ни названия,
              // ни даты. Сервер отвечает, что делать вместо этого.
              Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуйте ещё раз');
            }
          },
        },
      ],
    );
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          <Button
            label={isNew ? 'Создать' : 'Сохранить'}
            size="lg"
            fullWidth
            loading={saving}
            onPress={handleSave}
          />
          {!isNew && <Button label="Удалить вечеринку" variant="ghost" fullWidth onPress={handleDelete} />}
        </View>
      }
    >
      <AdminHeader
        title={isNew ? 'Новая вечеринка' : 'Редактирование'}
        subtitle={isNew ? undefined : draft.title}
      />

      <View style={styles.section}>
        <Field
          label="Название"
          value={draft.title}
          onChangeText={(title) => patch({ title })}
          placeholder="NEON RITUAL"
          autoCapitalize="characters"
          error={showError && titleError ? titleError : undefined}
        />
        <Field
          label="Подзаголовок"
          value={draft.subtitle}
          onChangeText={(subtitle) => patch({ subtitle })}
          placeholder="Резиденты клуба"
        />
        <Field
          label="Описание"
          value={draft.description}
          onChangeText={(description) => patch({ description })}
          placeholder="Что будет на вечеринке"
          multiline
        />
      </View>

      {!isNew && (
        <View style={styles.section}>
          <Text variant="label" tone="faint">
            Состояние
          </Text>
          <Segmented
            options={[
              { value: 'published', label: 'В афише' },
              { value: 'draft', label: 'Черновик' },
              { value: 'cancelled', label: 'Отменена' },
            ]}
            value={draft.status ?? 'published'}
            onChange={(status) => patch({ status })}
          />
          <Text variant="caption" tone="faint">
            {STATUS_HINT[draft.status ?? 'published']}
          </Text>
        </View>
      )}

      {/* Дата */}
      <View style={styles.section}>
        <Text variant="label" tone="faint">
          Дата и время
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPickerOpen(true)}
          style={styles.dateButton}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.accent} />
          <Text variant="body" style={styles.flex}>
            {formatEventDate(new Date(draft.date))}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Segmented
          label="Жанр"
          scrollable
          options={GENRES.map((g) => ({ value: g, label: GENRE_LABEL[g] }))}
          value={draft.genre}
          onChange={(genre) => patch({ genre })}
        />
        <NumberField
          label="Возрастное ограничение"
          value={draft.ageLimit}
          onChangeValue={(ageLimit) => patch({ ageLimit })}
          suffix="+"
          min={0}
          max={21}
        />
      </View>

      <View style={styles.section}>
        <CoverPicker value={draft.cover} onChange={(cover) => patch({ cover })} />
      </View>

      {/* Лайнап */}
      <View style={styles.section}>
        <Text variant="label" tone="faint">
          Лайнап
        </Text>

        <View style={styles.addRow}>
          <TextInput
            value={dj}
            onChangeText={setDj}
            placeholder="Имя диджея"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={addDj}
            style={styles.addInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Добавить диджея"
            onPress={addDj}
            style={styles.addButton}
          >
            <Ionicons name="add" size={22} color={colors.onAccent} />
          </Pressable>
        </View>

        {draft.lineup.map((name) => (
          <View key={name} style={styles.chipRow}>
            <Text variant="body" style={styles.flex}>
              {name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Убрать ${name}`}
              hitSlop={10}
              onPress={() => patch({ lineup: draft.lineup.filter((n) => n !== name) })}
            >
              <Ionicons name="close" size={18} color={colors.textFaint} />
            </Pressable>
          </View>
        ))}
      </View>

      {/* Билеты */}
      <View style={styles.section}>
        <View style={styles.ticketsHead}>
          <Text variant="label" tone="faint">
            Типы билетов
          </Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={addTicket}>
            <Text variant="caption" tone="accent">
              Добавить
            </Text>
          </Pressable>
        </View>

        {showError && ticketsError && (
          <Text variant="caption" tone="danger">
            {ticketsError}
          </Text>
        )}

        {draft.tickets.map((ticket, i) => (
          <Card key={ticket.id} elevated style={styles.ticket}>
            <View style={styles.ticketHead}>
              <Text variant="bodyStrong">Билет {i + 1}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Удалить билет ${i + 1}`}
                hitSlop={10}
                onPress={() =>
                  setDraft((d) => ({ ...d, tickets: d.tickets.filter((_, j) => j !== i) }))
                }
              >
                <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
              </Pressable>
            </View>

            <Field
              label="Название"
              value={ticket.name}
              onChangeText={(name) => patchTicket(i, { name })}
              placeholder="Standard"
            />
            <Field
              label="Что входит"
              value={ticket.description}
              onChangeText={(description) => patchTicket(i, { description })}
              placeholder="Вход до 01:00"
            />
            <View style={styles.ticketNumbers}>
              <View style={styles.flex}>
                <NumberField
                  label="Цена"
                  value={ticket.price}
                  onChangeValue={(price) => patchTicket(i, { price })}
                  suffix="₽"
                />
              </View>
              <View style={styles.flex}>
                {/* Правится тираж, а не остаток: продано столько, сколько
                    продано, и правка тиража это число не трогает */}
                <NumberField
                  label="Выпущено"
                  value={ticket.quantity ?? ticket.available}
                  onChangeValue={(quantity) => patchTicket(i, { quantity })}
                  suffix="шт"
                />
              </View>
            </View>

            {soldOf(ticket) > 0 && (
              <Text variant="caption" tone="faint">
                Продано {soldOf(ticket)} · осталось {ticket.available}
              </Text>
            )}
          </Card>
        ))}
      </View>

      {!isNew && <RefundSection event={draft} dirty={dirty} onDone={() => router.back()} />}

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Когда">
        <View style={styles.picker}>
          <DateTimePicker
            value={new Date(draft.date)}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            themeVariant="dark"
            minuteInterval={15}
            onChange={(_, selected) => {
              if (selected) patch({ date: selected.toISOString() });
              // На Android пикер модальный и закрывается сам
              if (Platform.OS !== 'ios') setPickerOpen(false);
            }}
          />
        </View>
        <Button label="Готово" size="lg" fullWidth onPress={() => setPickerOpen(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  addInput: {
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
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ticketsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticket: {
    gap: spacing.lg,
  },
  ticketHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketNumbers: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  picker: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  footer: {
    gap: spacing.sm,
  },
});
