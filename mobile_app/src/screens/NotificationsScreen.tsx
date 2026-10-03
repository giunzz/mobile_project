import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { useFeeder } from '../context/FeederContext';
import { NavigationProps } from '../navigation';
import { colors, radii, spacing } from '../theme';
import { NotificationKind } from '../types/models';
import { formatTimeAgo } from '../utils/format';

const iconByKind: Record<NotificationKind, string> = {
  success: '✓',
  warning: '!',
  error: '×',
  device: '⌁',
};

export function NotificationsScreen({ goBack }: NavigationProps) {
  const { snapshot, markAllNotificationsRead } = useFeeder();
  if (!snapshot) {
    return null;
  }
  const unread = snapshot.notifications.filter(item => !item.read).length;
  const markRead = async () => {
    try {
      await markAllNotificationsRead();
    } catch (error) {
      Alert.alert(
        'Firebase update failed',
        error instanceof Error
          ? error.message
          : 'Unable to update notifications.',
      );
    }
  };

  return (
    <Screen>
      <AppHeader
        actionLabel={unread ? 'Mark all read' : undefined}
        onAction={unread ? markRead : undefined}
        onBack={goBack}
        subtitle={`${unread} unread alert${unread === 1 ? '' : 's'}`}
        title="Notifications"
      />
      <Text style={styles.emptyText}>
        In-app results from firmware. Read marks last for this sign-in session;
        background push is not enabled.
      </Text>
      {snapshot.notifications.map(item => (
        <Card
          key={item.id}
          style={[styles.card, !item.read && styles.unreadCard]}
        >
          <View style={[styles.iconBox, styles[`${item.kind}Box`]]}>
            <Text style={[styles.icon, styles[`${item.kind}Icon`]]}>
              {iconByKind[item.kind]}
            </Text>
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{item.title}</Text>
              {!item.read ? <View style={styles.unreadDot} /> : null}
            </View>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.time}>{formatTimeAgo(item.timestamp)}</Text>
          </View>
        </Card>
      ))}
      {!snapshot.notifications.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>You're all caught up</Text>
          <Text style={styles.emptyText}>
            Reported feeding results will appear here when notifications are
            enabled for that species.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', marginBottom: spacing.md },
  unreadCard: { borderColor: '#A8D7CB', borderWidth: 1.5 },
  iconBox: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 44,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 44,
  },
  icon: { fontSize: 20, fontWeight: '900' },
  successBox: { backgroundColor: colors.successSoft },
  warningBox: { backgroundColor: colors.warningSoft },
  errorBox: { backgroundColor: colors.dangerSoft },
  deviceBox: { backgroundColor: colors.infoSoft },
  successIcon: { color: colors.success },
  warningIcon: { color: colors.warning },
  errorIcon: { color: colors.danger },
  deviceIcon: { color: colors.info },
  copy: { flex: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row' },
  title: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '900' },
  unreadDot: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 8,
    marginLeft: 6,
    width: 8,
  },
  message: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  time: { color: colors.muted, fontSize: 9, marginTop: spacing.sm },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  emptyText: { color: colors.muted, fontSize: 12, marginTop: 4 },
});
