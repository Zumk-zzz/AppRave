import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/src/theme';
import { Screen } from './Screen';
import { Text } from './Text';

/**
 * Временная заглушка вкладки. Удаляется по мере того, как экраны
 * наполняются на шагах 4–8.
 */
export function Placeholder({
  title,
  description,
  icon,
  step,
}: {
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  step: string;
}) {
  return (
    <Screen>
      <View style={styles.root}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={30} color={colors.accent} />
        </View>
        <Text variant="title" style={styles.center}>
          {title}
        </Text>
        <Text variant="body" tone="muted" style={styles.center}>
          {description}
        </Text>
        <Text variant="label" tone="faint" style={styles.center}>
          {step}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
});
