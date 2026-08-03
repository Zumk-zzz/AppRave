import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/src/components';
import { colors, radius, spacing } from '@/src/theme';

/** Заглушка крупной карточки афиши — повторяет её реальные пропорции. */
export function EventSkeletonFeatured() {
  return (
    <View style={styles.featured}>
      <View style={styles.featuredTop}>
        <Skeleton width={78} height={24} round={radius.pill} />
      </View>
      <View style={styles.featuredBottom}>
        <Skeleton width={120} height={12} />
        <Skeleton width="80%" height={32} round={radius.sm} />
        <Skeleton width="55%" height={16} />
      </View>
    </View>
  );
}

/** Заглушка строки списка. */
export function EventSkeletonCompact() {
  return (
    <View style={styles.compact}>
      <Skeleton width={62} height={62} round={radius.sm} />
      <View style={styles.compactBody}>
        <Skeleton width="70%" height={18} />
        <Skeleton width="45%" height={13} />
        <Skeleton width={90} height={13} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  featured: {
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  featuredTop: {
    flexDirection: 'row',
  },
  featuredBottom: {
    gap: spacing.sm,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  compactBody: {
    flex: 1,
    gap: spacing.sm,
  },
});
