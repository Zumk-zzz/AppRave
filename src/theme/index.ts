/**
 * Дизайн-токены AppRave.
 *
 * Единственный источник правды по цветам, отступам и типографике.
 * Компоненты не используют hex-значения напрямую — только импорт отсюда,
 * поэтому перекрасить приложение целиком = поменять этот файл.
 */

export const colors = {
  /** Почти-чёрный фон приложения */
  bg: '#0A0A0B',
  /** Карточки и панели поверх фона */
  surface: '#131316',
  /** Приподнятые поверхности: модалки, выделенные карточки */
  surfaceElevated: '#1C1C21',
  /** Границы и разделители */
  border: '#26262C',

  /**
   * Токсично-розовый — главный акцент.
   * Текст на нём всегда чёрный: контраст 5.7:1 против 3.5:1 у белого.
   */
  accent: '#FF2E93',
  accentDim: '#D41C76',
  /** Текст и иконки поверх акцентной заливки */
  onAccent: '#0A0A0B',

  text: '#FFFFFF',
  textMuted: '#A1A1AA',
  textFaint: '#71717A',

  danger: '#FF4D4D',
  success: '#4ADE80',

  /**
   * QR-код: всегда чёрное на белом, независимо от темы приложения.
   *
   * Это не оформление, а требование сканера: код на тёмном фоне
   * дешёвые сканеры на входе читают плохо или не читают вовсе.
   */
  qrBackground: '#FFFFFF',
  qrForeground: '#0A0A0B',

  /** Уровни клубной карты */
  tierSilver: '#C0C4CC',
  tierGold: '#E8B923',
  tierBlack: '#8B5CF6',
} as const;

/** Шаг сетки — 4. Все отступы кратны ему. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const fonts = {
  /** Геометрический гротеск с кириллицей — заголовки и цифры */
  display: 'Unbounded_700Bold',
  displayMedium: 'Unbounded_500Medium',
  /** Основной текст */
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  xxxl: 36,
} as const;

/**
 * Градиент акцентного свечения за заголовками.
 * Живёт здесь, а не в экранах: иначе при смене акцента rgba-значения
 * останутся старыми и разъедутся с основным цветом.
 */
export const gradients = {
  accentGlow: ['rgba(255,46,147,0.15)', 'rgba(255,46,147,0)'] as const,
};

/** Свечение вокруг акцентных элементов — фирменная деталь тёмной темы. */
export const glow = {
  accent: {
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  fonts,
  fontSize,
  gradients,
  glow,
} as const;

export type Theme = typeof theme;
