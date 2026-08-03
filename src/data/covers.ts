/**
 * Палитра обложек для афиши.
 *
 * Администратор выбирает готовую пару, а не подбирает цвета вручную:
 * так любая новая вечеринка гарантированно попадает в стиль приложения,
 * и нельзя случайно сделать афишу белой на белом.
 */
export const COVER_PRESETS: { id: string; label: string; colors: readonly [string, string] }[] = [
  { id: 'pink', label: 'Розовый', colors: ['#FF2E93', '#7A1350'] },
  { id: 'cyan', label: 'Циан', colors: ['#00E5FF', '#0A3D52'] },
  { id: 'orange', label: 'Оранж', colors: ['#FF5C00', '#5A1E00'] },
  { id: 'gold', label: 'Золото', colors: ['#E8B923', '#5A4300'] },
  { id: 'violet', label: 'Фиолет', colors: ['#8B5CF6', '#2B1857'] },
  { id: 'lime', label: 'Лайм', colors: ['#CCFF00', '#3E4D00'] },
  { id: 'ice', label: 'Лёд', colors: ['#7DD3FC', '#0C2A3D'] },
  { id: 'blood', label: 'Кровь', colors: ['#FF4D4D', '#4A0D0D'] },
];

export const DEFAULT_COVER = COVER_PRESETS[0].colors;

/** Найти пресет по паре цветов — нужно, чтобы подсветить выбранный при открытии формы. */
export function coverPresetId(cover: readonly [string, string]): string {
  return COVER_PRESETS.find((p) => p.colors[0] === cover[0])?.id ?? COVER_PRESETS[0].id;
}
