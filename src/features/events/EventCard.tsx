import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Badge, Text } from '@/src/components';
import { GENRE_LABEL, isLowStock, isSoldOut, minPrice, totalAvailable } from '@/src/lib/events';
import { formatEventDate, formatPrice, formatShortDate, formatTime } from '@/src/lib/format';
import type { ClubEvent } from '@/src/services';
import { colors, radius, spacing } from '@/src/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Затемнение снизу — без него текст тонет в светлых участках градиента. */
const SCRIM = ['rgba(10,10,11,0)', 'rgba(10,10,11,0.55)', 'rgba(10,10,11,0.92)'] as const;

export function EventCardFeatured({ event, onPress }: { event: ClubEvent; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const soldOut = isSoldOut(event);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withTiming(0.985, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 });
      }}
      style={[styles.featured, animatedStyle]}
    >
      <LinearGradient
        colors={event.cover}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient colors={SCRIM} style={StyleSheet.absoluteFill} />

      <View style={styles.featuredTop}>
        <Badge label={GENRE_LABEL[event.genre]} tone="neutral" />
        {soldOut ? (
          <Badge label="Распродано" tone="danger" />
        ) : isLowStock(event) ? (
          <Badge label={`Осталось ${totalAvailable(event)}`} tone="accent" />
        ) : null}
      </View>

      <View style={styles.featuredBottom}>
        <Text variant="label" tone="accent">
          {formatEventDate(new Date(event.date))}
        </Text>
        <Text variant="display" style={styles.featuredTitle} numberOfLines={2}>
          {event.title}
        </Text>
        <Text variant="body" tone="muted" numberOfLines={1}>
          {event.subtitle}
        </Text>

        <View style={styles.featuredFooter}>
          <Text variant="caption" tone="faint">
            {event.ageLimit}+
          </Text>
          <View style={styles.dot} />
          <Text variant="caption" tone="faint" numberOfLines={1} style={styles.flex}>
            {event.lineup.join(' · ')}
          </Text>
          {!soldOut && (
            <Text variant="bodyStrong">от {formatPrice(minPrice(event))}</Text>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
}

export function EventCardCompact({ event, onPress }: { event: ClubEvent; onPress: () => void }) {
  const date = new Date(event.date);
  const soldOut = isSoldOut(event);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.compact, pressed && styles.compactPressed]}
    >
      <View style={styles.thumb}>
        <LinearGradient
          colors={event.cover}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.thumbInner}>
          <Text variant="bodyStrong" style={styles.thumbDate}>
            {formatShortDate(date)}
          </Text>
          <Text variant="caption" style={styles.thumbTime}>
            {formatTime(date)}
          </Text>
        </View>
      </View>

      <View style={styles.compactBody}>
        <Text variant="subtitle" numberOfLines={1}>
          {event.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {GENRE_LABEL[event.genre]} · {event.subtitle}
        </Text>
        {soldOut ? (
          <Text variant="caption" tone="danger">
            Распродано
          </Text>
        ) : (
          <Text variant="caption" tone="accent">
            от {formatPrice(minPrice(event))}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  featured: {
    height: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  featuredTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  featuredBottom: {
    gap: spacing.xs,
  },
  featuredTitle: {
    fontSize: 32,
    lineHeight: 36,
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textFaint,
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
  compactPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbInner: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,11,0.45)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  thumbDate: {
    color: colors.text,
  },
  thumbTime: {
    color: colors.textMuted,
  },
  compactBody: {
    flex: 1,
    gap: 2,
  },
});
