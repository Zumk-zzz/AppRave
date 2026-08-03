import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Field,
  NumberField,
  Screen,
  SectionHeader,
  Sheet,
  Text,
  Toggle,
} from '@/src/components';
import { ZONE_LABEL } from '@/src/data/tables';
import { AdminHeader } from '@/src/features/admin/AdminHeader';
import { formatPrice, pluralWithCount } from '@/src/lib/format';
import { adminService, type TableZone } from '@/src/services';
import { useCatalogStore, type TableLayout } from '@/src/store/catalog';
import { colors, spacing } from '@/src/theme';

const ZONES: TableZone[] = ['vip', 'lounge', 'bar'];

export default function AdminTables() {
  const tables = useCatalogStore((s) => s.tables);

  const [draft, setDraft] = useState<TableLayout | null>(null);
  const [saving, setSaving] = useState(false);

  const blocked = tables.filter((t) => t.blocked).length;

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    // taken вычисляется на дату, поэтому в каталог уходит только раскладка
    await adminService.saveTable({ ...draft, taken: false });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    setDraft(null);
  };

  return (
    <Screen scroll>
      <AdminHeader
        title="Столы"
        subtitle={blocked > 0 ? `${blocked} снято с продажи` : `${tables.length} столов`}
      />

      <Text variant="caption" tone="faint" style={styles.note}>
        Расположение на схеме задаётся в коде. Здесь меняются вместимость, депозит
        и доступность — то, что меняется от сезона к сезону.
      </Text>

      {ZONES.map((zone) => {
        const inZone = tables.filter((t) => t.zone === zone);
        if (inZone.length === 0) return null;

        return (
          <View key={zone}>
            <SectionHeader title={ZONE_LABEL[zone]} kicker={`${inZone.length} столов`} />
            <View style={styles.list}>
              {inZone.map((table) => (
                <Card key={table.id} onPress={() => setDraft({ ...table })} style={styles.row}>
                  <View style={styles.label}>
                    <Text variant="bodyStrong">{table.label}</Text>
                  </View>

                  <View style={styles.flex}>
                    <Text variant="body">
                      {pluralWithCount(table.seats, 'место', 'места', 'мест')}
                    </Text>
                    <Text variant="caption" tone="faint">
                      Депозит {formatPrice(table.deposit)}
                    </Text>
                  </View>

                  {table.blocked && <Badge label="Снят" tone="danger" />}
                </Card>
              ))}
            </View>
          </View>
        );
      })}

      <Sheet
        visible={draft !== null}
        onClose={() => setDraft(null)}
        title={draft ? `Стол ${draft.label}` : ''}
      >
        {draft && (
          <View style={styles.sheet}>
            <Field
              label="Метка на схеме"
              value={draft.label}
              onChangeText={(label) => setDraft({ ...draft, label })}
              placeholder="V1"
              autoCapitalize="characters"
              maxLength={4}
            />

            <View style={styles.numbers}>
              <View style={styles.flex}>
                <NumberField
                  label="Мест"
                  value={draft.seats}
                  onChangeValue={(seats) => setDraft({ ...draft, seats })}
                  min={1}
                  max={20}
                />
              </View>
              <View style={styles.flex}>
                <NumberField
                  label="Депозит"
                  value={draft.deposit}
                  onChangeValue={(deposit) => setDraft({ ...draft, deposit })}
                  suffix="₽"
                />
              </View>
            </View>

            <Toggle
              label="Снят с продажи"
              hint="Ремонт или служебная бронь — стол занят на все даты"
              value={draft.blocked}
              onChange={(blocked) => setDraft({ ...draft, blocked })}
            />

            <Button label="Сохранить" size="lg" fullWidth loading={saving} onPress={handleSave} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    marginBottom: spacing.xl,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  label: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  numbers: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sheet: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
