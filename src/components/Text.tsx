import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';

import { colors, fonts, fontSize } from '@/src/theme';

export type TextVariant =
  /** Крупный заголовок экрана */
  | 'display'
  /** Заголовок секции или карточки */
  | 'title'
  /** Подзаголовок */
  | 'subtitle'
  /** Основной текст */
  | 'body'
  /** Основной текст с акцентом */
  | 'bodyStrong'
  /** Вторичный текст, подписи */
  | 'caption'
  /** Мелкая разрядка капсом: «БЛИЖАЙШЕЕ», «VIP» */
  | 'label';

export type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'onAccent' | 'danger' | 'success';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

const toneColor: Record<TextTone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  faint: colors.textFaint,
  accent: colors.accent,
  onAccent: colors.onAccent,
  danger: colors.danger,
  success: colors.success,
};

/**
 * Единственный способ вывести текст в приложении.
 * Компоненты не задают fontFamily напрямую — иначе шрифт неизбежно
 * разъезжается между экранами.
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  return <RNText style={[styles[variant], { color: toneColor[tone] }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  display: {
    fontFamily: fonts.display,
    fontSize: fontSize.xxxl,
    lineHeight: 42,
    letterSpacing: -1,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: fontSize.xl,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: fonts.displayMedium,
    fontSize: fontSize.lg,
    lineHeight: 24,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: fonts.bodySemi,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    lineHeight: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
