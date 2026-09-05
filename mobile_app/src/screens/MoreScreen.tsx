import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useFeeder } from '../context/FeederContext';
import { AppRoute, NavigationProps } from '../navigation';
import { colors, radii, spacing } from '../theme';

const menuItems: {
  route: AppRoute;
  icon: string;
  title: string;
  hint: string;
}[] = [
  {
    route: 'history',
    icon: '↻',
    title: 'Feeding history',
    hint: 'Review all completed and failed commands',
  },
  {
    route: 'statistics',
    icon: '▥',
    title: 'Statistics',
    hint: 'Food usage and system performance',
  },
  {
    route: 'notifications',
    icon: '!',
    title: 'Notifications',
    hint: 'Safety, food and device alerts',
  },
  {
    route: 'device',
    icon: '⌁',
    title: 'Device settings',
    hint: 'Connection, firmware and edge AI status',
  },
];

export function MoreScreen({ navigate }: NavigationProps) {
  const { snapshot, currentUser, logout } = useFeeder();
  if (!snapshot) {
    return null;
  }
  const unread = snapshot.notifications.filter(item => !item.read).length;

  return (
    <Screen>
      <AppHeader subtitle="Account, reports and device" title="More" />
      <Card style={styles.accountCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>PO</Text>
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountName}>{currentUser?.name}</Text>
          <Text style={styles.accountEmail}>{currentUser?.email}</Text>
        </View>
        <StatusBadge label="Firebase" tone="success" />
      </Card>

      <View style={styles.menu}>
        {menuItems.map(item => (
          <Pressable
            key={item.route}
            onPress={() => navigate(item.route)}
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.menuIcon}>
              <Text style={styles.menuIconText}>{item.icon}</Text>
            </View>
            <View style={styles.menuCopy}>
              <Text style={styles.menuTitle}>
                {item.title}
                {item.route === 'notifications' && unread ? ` (${unread})` : ''}
              </Text>
              <Text style={styles.menuHint}>{item.hint}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.aboutBox}>
        <Text style={styles.aboutTitle}>AI Smart Pet Feeder</Text>
        <Text style={styles.aboutText}>
          React Native + TypeScript · Firebase realtime sync
        </Text>
      </View>
      <PrimaryButton label="Sign out" onPress={logout} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  accountCard: { alignItems: 'center', flexDirection: 'row' },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 48,
  },
  avatarText: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  accountCopy: { flex: 1 },
  accountName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  accountEmail: { color: colors.muted, fontSize: 11, marginTop: 3 },
  menu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginVertical: spacing.xl,
    overflow: 'hidden',
  },
  menuItem: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: spacing.lg,
  },
  pressed: { backgroundColor: colors.background },
  menuIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    height: 42,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 42,
  },
  menuIconText: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  menuCopy: { flex: 1 },
  menuTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  menuHint: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  chevron: { color: colors.muted, fontSize: 26 },
  aboutBox: { alignItems: 'center', marginBottom: spacing.xl },
  aboutTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  aboutText: { color: colors.muted, fontSize: 10, marginTop: 4 },
});
