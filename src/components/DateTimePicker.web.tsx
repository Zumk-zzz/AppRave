import { createElement, useEffect, useState, type ComponentProps } from 'react';
import type NativePicker from '@react-native-community/datetimepicker';
import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';

function localValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
export default function DateTimePicker({ value, onChange, minuteInterval }: ComponentProps<typeof NativePicker>) {
  const [draft, setDraft] = useState(() => localValue(value));
  useEffect(() => { setDraft(localValue(value)); }, [value]);
  return createElement('input', {
    type: 'datetime-local', 'aria-label': 'Дата и время вечеринки', value: draft,
    step: (minuteInterval ?? 1) * 60,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(event.target.value);
      const date = new Date(event.target.value);
      if (Number.isFinite(date.getTime())) onChange?.({ type: 'set', nativeEvent: { timestamp: date.getTime(), utcOffset: -date.getTimezoneOffset() } }, date);
    },
    style: { colorScheme: 'dark', color: colors.text, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: spacing.lg, fontFamily: fonts.body, fontSize: fontSize.md, width: '100%', boxSizing: 'border-box' },
  });
}
