import { BlurView } from 'expo-blur';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radius, spacing } from '@/src/theme';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Шторка снизу. Затемнение размывает фон — на тёмной теме это читается
 * лучше, чем простая полупрозрачная заливка.
 */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, Platform.OS === 'web' && styles.webRoot]}>
        {/* Тап по затемнению закрывает шторку */}
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть">
          <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>

        <ScrollView style={[styles.sheet, Platform.OS === 'web' && styles.webSheet]} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }} keyboardShouldPersistTaps="handled">
          <View style={styles.grabber} />
          {title && (
            <Text variant="title" style={styles.title}>
              {title}
            </Text>
          )}
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webRoot: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  webSheet: { width: '100%', maxWidth: layout.dialogMaxWidth, borderRadius: radius.lg },
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.backdrop,
  },
  sheet: {
    maxHeight: '90%',
    flexGrow: 0,
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  title: {
    marginBottom: spacing.lg,
  },
});
