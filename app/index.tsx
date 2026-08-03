import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, fontSize, radius, spacing } from '@/src/theme';

/**
 * Временный стартовый экран (шаг 1).
 * Задача — подтвердить, что сборка доезжает до телефона: шрифты, градиент,
 * тема и safe area работают. На шаге 3 заменяется на реальную навигацию.
 */
export default function Index() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* Мягкое лаймовое свечение за заголовком */}
      <LinearGradient
        colors={['rgba(204,255,0,0.16)', 'rgba(204,255,0,0)']}
        style={styles.glow}
        pointerEvents="none"
      />

      <View style={styles.center}>
        <Text style={styles.kicker}>NIGHT CLUB</Text>
        <Text style={styles.title}>APPRAVE</Text>
        <View style={styles.rule} />
        <Text style={styles.subtitle}>
          Билеты, столики и бар{'\n'}в одном приложении
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.badge}>
          <View style={styles.dot} />
          <Text style={styles.badgeText}>Сборка запущена</Text>
        </View>
        <Text style={styles.hint}>Expo SDK 54 · шаг 1 из 9</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  glow: {
    position: 'absolute',
    top: -160,
    left: -80,
    right: -80,
    height: 480,
    borderRadius: 240,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  kicker: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    letterSpacing: 4,
    color: colors.accent,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 44,
    letterSpacing: -1,
    color: colors.text,
    textAlign: 'center',
  },
  rule: {
    width: 56,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginVertical: spacing.xl,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    lineHeight: 26,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  badgeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.textFaint,
  },
});
