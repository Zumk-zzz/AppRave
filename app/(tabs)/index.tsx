import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Chip, ChipRow, Screen, SectionHeader, Text } from '@/src/components';
import { EventCardCompact, EventCardFeatured } from '@/src/features/events/EventCard';
import { EventSkeletonCompact, EventSkeletonFeatured } from '@/src/features/events/EventSkeleton';
import { GENRE_LABEL } from '@/src/lib/events';
import { eventsService, type ClubEvent, type Genre } from '@/src/services';
import { useAuthStore } from '@/src/store/auth';
import { colors, spacing } from '@/src/theme';

type Filter = 'all' | Genre;

const FILTERS: Filter[] = ['all', 'techno', 'house', 'hiphop', 'disco'];

export default function AfishaTab() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [events, setEvents] = useState<ClubEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  // Растёт при каждой удачной загрузке. Уходит в key списка, чтобы карточки
  // перемонтировались и заново проиграли появление: entering срабатывает
  // только при монтировании, иначе после обновления список менялся бы рывком.
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setEvents(await eventsService.list());
      setRevision((r) => r + 1);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const visible = useMemo(() => {
    if (!events) return [];
    return filter === 'all' ? events : events.filter((e) => e.genre === filter);
  }, [events, filter]);

  const openEvent = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

  const [featured, ...rest] = visible;

  return (
    <Screen
      scroll
      padded={false}
      contentContainerStyle={styles.scrollBody}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text variant="label" tone="accent">
          {greeting()}
          {user ? `, ${user.name}` : ''}
        </Text>
        <Text variant="display">Афиша</Text>
      </View>

      <ChipRow>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={f === 'all' ? 'Все' : GENRE_LABEL[f]}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ChipRow>

      {events === null && !failed && (
        <View style={[styles.padded, styles.skeletons]}>
          <EventSkeletonFeatured />
          <View style={styles.list}>
            <EventSkeletonCompact />
            <EventSkeletonCompact />
            <EventSkeletonCompact />
          </View>
        </View>
      )}

      {failed && (
        <View style={[styles.center, styles.padded]}>
          <Text variant="body" tone="muted" style={styles.centerText}>
            Не удалось загрузить афишу
          </Text>
          <Button label="Повторить" variant="surface" onPress={load} />
        </View>
      )}

      {events !== null && !failed && visible.length === 0 && (
        <View style={[styles.center, styles.padded]}>
          <Text variant="body" tone="muted" style={styles.centerText}>
            В этой категории пока пусто.{'\n'}Загляните в другие — там жарко.
          </Text>
        </View>
      )}

      {/* Ключ включает фильтр и ревизию: и обновление, и смена жанра
          перемонтируют список, поэтому анимация проигрывается заново */}
      {featured && (
        <Animated.View
          key={`featured-${filter}-${revision}`}
          entering={FadeIn.duration(320)}
          style={styles.padded}
        >
          <EventCardFeatured event={featured} onPress={() => openEvent(featured.id)} />
        </Animated.View>
      )}

      {rest.length > 0 && (
        <View style={[styles.padded, styles.rest]}>
          <SectionHeader title="Дальше в клубе" kicker="Расписание" />
          <View key={`list-${filter}-${revision}`} style={styles.list}>
            {rest.map((event, i) => (
              // Лесенка: список читается как последовательность, а не вспыхивает целиком
              <Animated.View key={event.id} entering={FadeInDown.delay(i * 60).duration(260)}>
                <EventCardCompact event={event} onPress={() => openEvent(event.id)} />
              </Animated.View>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

/** Приветствие по времени суток — мелочь, но экран сразу оживает. */
function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 18) return 'Добрый день';
  if (h >= 18 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
  rest: {
    marginTop: spacing.xxl,
  },
  list: {
    gap: spacing.md,
  },
  center: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  centerText: {
    textAlign: 'center',
  },
  skeletons: {
    gap: spacing.xxl,
  },
  // Запас снизу под плавающую панель заказа
  scrollBody: {
    paddingBottom: 110,
  },
});
