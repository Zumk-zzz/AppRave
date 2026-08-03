import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/src/components';
import { FLOOR_FIXTURES } from '@/src/data/tables';
import type { ClubTable } from '@/src/services';
import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';

/** Схема выше, чем шире — так зал целиком помещается на экран телефона. */
const ASPECT = 1.3;

export function FloorMap({
  tables,
  selectedId,
  onSelect,
}: {
  tables: ClubTable[];
  selectedId: string | null;
  onSelect: (table: ClubTable) => void;
}) {
  const [width, setWidth] = useState(0);
  const height = width * ASPECT;

  const handleLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.root} onLayout={handleLayout}>
      {width > 0 && (
        <View style={[styles.canvas, { height }]}>
          {FLOOR_FIXTURES.map((f) => (
            <View
              key={f.id}
              style={[
                styles.fixture,
                {
                  left: f.x * width,
                  top: f.y * height,
                  width: f.w * width,
                  height: f.h * height,
                },
              ]}
            >
              <Text style={styles.fixtureLabel}>{f.label}</Text>
            </View>
          ))}

          {tables.map((table) => {
            const selected = table.id === selectedId;

            return (
              <Pressable
                key={table.id}
                accessibilityRole="button"
                accessibilityLabel={`Стол ${table.label}, ${table.seats} мест${
                  table.taken ? ', занят' : ''
                }`}
                accessibilityState={{ selected, disabled: table.taken }}
                disabled={table.taken}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelect(table);
                }}
                style={({ pressed }) => [
                  styles.table,
                  {
                    left: table.x * width,
                    top: table.y * height,
                    width: table.w * width,
                    height: table.h * height,
                  },
                  table.taken && styles.tableTaken,
                  selected && styles.tableSelected,
                  pressed && !table.taken && styles.tablePressed,
                ]}
              >
                <Text
                  style={[
                    styles.tableLabel,
                    table.taken && styles.tableLabelTaken,
                    selected && styles.tableLabelSelected,
                  ]}
                >
                  {table.label}
                </Text>
                <Text
                  style={[
                    styles.tableSeats,
                    table.taken && styles.tableLabelTaken,
                    selected && styles.tableLabelSelected,
                  ]}
                >
                  {table.taken ? 'занят' : `${table.seats} мест`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Пояснение к цветам схемы. Без него занятые столы читаются как ошибка. */
export function FloorLegend() {
  return (
    <View style={styles.legend}>
      <LegendItem color={colors.surfaceElevated} border={colors.border} label="Свободен" />
      <LegendItem color={colors.accent} border={colors.accent} label="Выбран" />
      <LegendItem color={colors.bg} border={colors.border} label="Занят" dim />
    </View>
  );
}

function LegendItem({
  color,
  border,
  label,
  dim,
}: {
  color: string;
  border: string;
  label: string;
  dim?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          { backgroundColor: color, borderColor: border },
          dim && styles.legendSwatchDim,
        ]}
      />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  canvas: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  fixture: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  fixtureLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  table: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  tableSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tablePressed: {
    opacity: 0.75,
  },
  tableTaken: {
    backgroundColor: colors.bg,
    opacity: 0.45,
  },
  tableLabel: {
    fontFamily: fonts.display,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  tableSeats: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 13,
    color: colors.textMuted,
  },
  tableLabelSelected: {
    color: colors.onAccent,
  },
  tableLabelTaken: {
    color: colors.textFaint,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
  },
  legendSwatchDim: {
    opacity: 0.45,
  },
});
