import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Field, NumberField, Screen, Segmented, Toggle } from '@/src/components';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/src/data/bar';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { adminService, type BarCategory, type BarItem, type StockItem } from '@/src/services';
import { useCatalogStore } from '@/src/store/catalog';
import { spacing } from '@/src/theme';

function blankItem(): BarItem {
  return {
    id: `b_${Date.now()}`,
    name: '',
    description: '',
    price: 500,
    category: 'cocktails',
    volume: '',
    popular: false,
    available: true,
  };
}

export default function AdminBarItemForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const existingItem = useCatalogStore((s) => s.barMenu.find((i) => i.id === id));
  const existingStock = useCatalogStore((s) => s.stock.find((x) => x.barItemId === id));
  const isNew = id === 'new';

  const [draft, setDraft] = useState<BarItem>(() =>
    existingItem ? { ...existingItem } : blankItem(),
  );
  const [stock, setStock] = useState<Pick<StockItem, 'qty' | 'unit' | 'lowThreshold'>>(() => ({
    qty: existingStock?.qty ?? 0,
    unit: existingStock?.unit ?? 'шт',
    lowThreshold: existingStock?.lowThreshold ?? 5,
  }));
  const [saving, setSaving] = useState(false);
  const [showError, setShowError] = useState(false);

  const patch = (part: Partial<BarItem>) => setDraft((d) => ({ ...d, ...part }));

  const nameError = draft.name.trim().length === 0 ? 'Позиции нужно название' : null;

  const handleSave = async () => {
    if (nameError) {
      setShowError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setSaving(true);
    await adminService.saveBarItem(draft, stock);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Удалить позицию?', 'Вместе с ней исчезнут остаток и история движений.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await adminService.deleteBarItem(draft.id);
          router.back();
        },
      },
    ]);
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
          {!isNew && <Button label="Удалить позицию" variant="ghost" fullWidth onPress={handleDelete} />}
        </View>
      }
    >
      <AdminHeader
        title={isNew ? 'Новая позиция' : 'Позиция меню'}
        subtitle={isNew ? undefined : draft.name}
      />

      <View style={styles.section}>
        <Field
          label="Название"
          value={draft.name}
          onChangeText={(name) => patch({ name })}
          placeholder="Негрони"
          error={showError && nameError ? nameError : undefined}
        />
        <Field
          label="Состав"
          value={draft.description}
          onChangeText={(description) => patch({ description })}
          placeholder="Джин, кампари, красный вермут"
          multiline
        />
        <Field
          label="Объём"
          value={draft.volume}
          onChangeText={(volume) => patch({ volume })}
          placeholder="90 мл"
          hint="Показывается под ценой в меню"
        />
      </View>

      <View style={styles.section}>
        <Segmented
          label="Категория"
          scrollable
          options={CATEGORY_ORDER.map((c) => ({ value: c as BarCategory, label: CATEGORY_LABEL[c] }))}
          value={draft.category}
          onChange={(category) => patch({ category })}
        />
        <NumberField
          label="Цена"
          value={draft.price}
          onChangeValue={(price) => patch({ price })}
          suffix="₽"
        />
      </View>

      <View style={styles.section}>
        <Toggle
          label="В продаже"
          hint="Выключено — позиция видна в меню, но её нельзя заказать"
          value={draft.available}
          onChange={(available) => patch({ available })}
        />
        <Toggle
          label="Хит продаж"
          hint="Помечает карточку в меню"
          value={draft.popular ?? false}
          onChange={(popular) => patch({ popular })}
        />
      </View>

      {/* Склад */}
      <View style={styles.section}>
        <View style={styles.stockRow}>
          <View style={styles.flex}>
            <NumberField
              label="Остаток"
              value={stock.qty}
              onChangeValue={(qty) => setStock((s) => ({ ...s, qty }))}
            />
          </View>
          <View style={styles.flex}>
            <NumberField
              label="Порог «мало»"
              value={stock.lowThreshold}
              onChangeValue={(lowThreshold) => setStock((s) => ({ ...s, lowThreshold }))}
            />
          </View>
        </View>

        <Segmented
          label="Единица"
          options={[
            { value: 'шт', label: 'Штуки' },
            { value: 'бут', label: 'Бутылки' },
            { value: 'порц', label: 'Порции' },
          ]}
          value={stock.unit}
          onChange={(unit) => setStock((s) => ({ ...s, unit }))}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  stockRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  footer: {
    gap: spacing.sm,
  },
});
