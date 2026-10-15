import { useSyncExternalStore } from 'react';
import { Modal, StyleSheet, View, type AlertButton, type AlertOptions } from 'react-native';
import { colors, radius, spacing } from '@/src/theme';
import { Button } from './Button';
import { Text } from './Text';

type Dialog = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
const queue: Dialog[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => queue[0] ?? null;
const serverSnapshot = () => null;

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    queue.push({ title, message, buttons: buttons?.length ? buttons : [{ text: 'Понятно' }], options });
    notify();
  },
};

/** RN Alert в браузере не показывает подтверждения; сохраняем все кнопки и проверки. */
export function AlertHost() {
  const dialog = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const dismiss = () => {
    if (dialog?.options?.cancelable === false) return;
    queue.shift(); notify(); dialog?.options?.onDismiss?.();
  };
  return <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={dismiss}>
    <View style={styles.overlay}>
      {dialog && <View style={styles.dialog} accessibilityViewIsModal>
        <Text variant="title">{dialog.title}</Text>
        {!!dialog.message && <Text variant="body">{dialog.message}</Text>}
        {dialog.buttons.map((button, index) => <Button key={index} label={button.text ?? 'Понятно'}
          variant={button.style === 'cancel' ? 'outline' : 'accent'}
          onPress={() => { queue.shift(); notify(); button.onPress?.(); }} />)}
      </View>}
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.backdrop },
  dialog: { width: '100%', maxWidth: 480, backgroundColor: colors.surfaceElevated, padding: spacing.xl, borderRadius: radius.lg, gap: spacing.lg },
});
