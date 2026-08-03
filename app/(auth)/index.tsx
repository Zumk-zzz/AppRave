import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '@/src/components';
import { colors, gradients, spacing } from '@/src/theme';

/** Приветственный экран — первое, что видит незалогиненный пользователь. */
export default function Welcome() {
  const router = useRouter();

  return (
    <Screen>
      <LinearGradient colors={gradients.accentGlow} style={styles.glow} pointerEvents="none" />

      <View style={styles.hero}>
        <Text variant="label" tone="accent">
          Night club
        </Text>
        <Text variant="display" style={styles.title}>
          APPRAVE
        </Text>
        <Text variant="body" tone="muted" style={styles.lead}>
          Билеты, столики и заказ на баре{'\n'}— заранее и без очередей
        </Text>
      </View>

      <View style={styles.features}>
        <Feature text="Билет с QR прямо в телефоне" />
        <Feature text="Свой стол на карте зала" />
        <Feature text="Коктейли ждут к приходу" />
        <Feature text="Клубная карта и баллы" />
      </View>

      <View style={styles.actions}>
        <Button
          label="Войти по номеру"
          size="lg"
          fullWidth
          onPress={() => router.push('/(auth)/phone')}
        />
        <Text variant="caption" tone="faint" style={styles.legal}>
          Продолжая, вы соглашаетесь с правилами клуба{'\n'}и обработкой персональных данных
        </Text>
      </View>
    </Screen>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.bullet} />
      <Text variant="body" tone="muted" style={styles.featureText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -220,
    left: -100,
    right: -100,
    height: 460,
    borderRadius: 230,
  },
  hero: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  title: {
    marginTop: spacing.xs,
  },
  lead: {
    marginTop: spacing.sm,
  },
  features: {
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  featureText: {
    flex: 1,
  },
  actions: {
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  legal: {
    textAlign: 'center',
  },
});
