import { StatusBar } from 'expo-status-bar';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/src/theme';

export interface ScreenProps {
  children: React.ReactNode;
  /** Обернуть содержимое в прокрутку */
  scroll?: boolean;
  /** Горизонтальные отступы по краям экрана */
  padded?: boolean;
  /** Не отступать сверху — для экранов с картинкой под статус-баром */
  edgeToEdgeTop?: boolean;
  /** Закреплённая панель внизу: «Оплатить», «Забронировать» */
  footer?: React.ReactNode;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  /** Потянуть-обновить. Работает только вместе со scroll. */
  refreshControl?: ScrollViewProps['refreshControl'];
  style?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  edgeToEdgeTop = false,
  footer,
  contentContainerStyle,
  refreshControl,
  style,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const bodyStyle = [padded && styles.padded, style];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            { paddingTop: edgeToEdgeTop ? 0 : insets.top + spacing.sm },
            // Запас снизу, чтобы последний элемент не прилипал к панели или краю
            { paddingBottom: (footer ? spacing.md : insets.bottom) + spacing.xl },
            bodyStyle,
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.flex,
            { paddingTop: edgeToEdgeTop ? 0 : insets.top + spacing.sm },
            bodyStyle,
          ]}
        >
          {children}
        </View>
      )}

      {footer && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
