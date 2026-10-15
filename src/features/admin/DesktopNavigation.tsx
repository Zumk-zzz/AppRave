import { Link, usePathname } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/src/components';
import { useAuthStore, useCan } from '@/src/store/auth';
import { colors, layout, radius, spacing } from '@/src/theme';

export function DesktopNavigation() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const staff = useCan('staff:manage');
  const bar = useCan('scan:bar');
  const entries: { href: '/admin' | '/admin/events' | '/admin/floor' | '/admin/orders' | '/admin/stock' | '/admin/bar' | '/admin/tables' | '/admin/analytics' | '/admin/staff' | '/order-audit' | '/shift' | '/history' | '/(tabs)/queue'; title: string; show?: boolean }[] = [
    { href: '/admin', title: 'Обзор' }, { href: '/admin/events', title: 'Вечеринки' },
    { href: '/admin/floor', title: 'Столики в зале' }, { href: '/admin/orders', title: 'Заказы' },
    { href: '/(tabs)/queue', title: 'Очередь бара', show: bar },
    { href: '/admin/bar', title: 'Меню бара' }, { href: '/admin/stock', title: 'Склад' },
    { href: '/admin/tables', title: 'Схема столов' }, { href: '/admin/staff', title: 'Сотрудники', show: staff },
    { href: '/admin/analytics', title: 'Аналитика' }, { href: '/shift', title: 'Смены и отчёты' },
    { href: '/history', title: 'История исполнения' }, { href: '/order-audit', title: 'Найти заказ' },
  ];
  return <View style={styles.root}>
    <Text variant="title" tone="accent">AppRave</Text>
    <Text variant="caption" tone="muted">Рабочий кабинет</Text>
    <ScrollView style={styles.links} contentContainerStyle={{ gap: spacing.xs }}>{entries.filter((entry) => entry.show !== false).map((entry) => {
      const active = entry.href === '/admin' ? pathname === '/admin' : pathname.startsWith(entry.href);
      return <Link key={entry.href} href={entry.href} asChild><Pressable style={StyleSheet.flatten([styles.link, active && styles.active])} accessibilityRole="link">
        <Text variant="body" tone={active ? 'accent' : 'muted'}>{entry.title}</Text>
      </Pressable></Link>;
    })}</ScrollView>
    <Text variant="caption" tone="muted">{user?.name}</Text>
    <Link href="/(tabs)/profile" asChild><Pressable style={styles.link}><Text variant="body">Профиль и выход</Text></Pressable></Link>
  </View>;
}
const styles = StyleSheet.create({
  root: { width: layout.navigationWidth, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border, padding: spacing.xl, gap: spacing.md },
  links: { flex: 1, gap: spacing.xs, marginTop: spacing.lg },
  link: { padding: spacing.md, borderRadius: radius.sm }, active: { backgroundColor: colors.surfaceElevated },
});
