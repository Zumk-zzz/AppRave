import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components';
import { formatPrice, pluralWithCount } from '@/src/lib/format';
import { useCan } from '@/src/store/auth';
import { selectCount, selectTotal, useCartStore } from '@/src/store/cart';
import { colors, glow, radius, spacing } from '@/src/theme';

/** Высота стандартного таб-бара iOS без учёта безопасной зоны. */
const TAB_BAR_HEIGHT = 49;

/**
 * Плавающая панель заказа над таб-баром.
 * Живёт в layout вкладок, а не в каждом экране: иначе на переходах
 * между вкладками она мигала бы и пересобиралась.
 */
export function CartBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const count = useCartStore(selectCount);
  const total = useCartStore(selectTotal);
  const canBuy = useCan('purchase');

  // Персонал ничего не покупает, панель заказа ему не нужна
  if (!canBuy || count === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(160)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: TAB_BAR_HEIGHT + insets.bottom + spacing.md }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Оформить заказ на ${formatPrice(total)}`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/checkout');
        }}
        style={({ pressed }) => [styles.bar, glow.accent, pressed && styles.barPressed]}
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>

        <View style={styles.info}>
          <Text variant="caption" style={styles.label}>
            {pluralWithCount(count, 'позиция', 'позиции', 'позиций')}
          </Text>
          <Text variant="bodyStrong" style={styles.total}>
            {formatPrice(total)}
          </Text>
        </View>

        <Text variant="bodyStrong" style={styles.cta}>
          Оформить
        </Text>
        <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  barPressed: {
    opacity: 0.9,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10,10,11,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.onAccent,
    fontSize: 13,
    lineHeight: 26,
  },
  info: {
    flex: 1,
  },
  label: {
    color: 'rgba(10,10,11,0.65)',
  },
  total: {
    color: colors.onAccent,
  },
  cta: {
    color: colors.onAccent,
  },
});
