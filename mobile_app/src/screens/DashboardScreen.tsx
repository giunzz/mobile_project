import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SectionTitle } from '../components/SectionTitle';
import { StatusBadge } from '../components/StatusBadge';
import { useFeeder } from '../context/FeederContext';
import { NavigationProps } from '../navigation';
import { colors, radii, spacing } from '../theme';
import { findProfile, formatTimeAgo } from '../utils/format';

export function DashboardScreen({ navigate }: NavigationProps) {
  const { snapshot, currentUser } = useFeeder();
  if (!snapshot) {
    return null;
  }

  const detectedProfile = findProfile(
    snapshot.profiles,
    snapshot.detection.speciesId,
  );
  const lastFeeding = snapshot.history[0];
  const nextSchedule = snapshot.schedules
    .filter(item => item.enabled)
    .sort((a, b) => a.time.localeCompare(b.time))[0];
  const nextProfile = nextSchedule
    ? findProfile(snapshot.profiles, nextSchedule.speciesId)
    : undefined;
  const unread = snapshot.notifications.filter(item => !item.read).length;

  return (
    <Screen>
      <AppHeader
        actionLabel={unread ? `🔔 ${unread}` : '🔔'}
        onAction={() => navigate('notifications')}
        subtitle={`Hello, ${currentUser?.name ?? 'Pet Owner'}`}
        title="Your smart feeder"
      />

      <Card style={styles.deviceCard}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.eyebrow}>CONNECTED DEVICE</Text>
            <Text style={styles.deviceName}>{snapshot.device.name}</Text>
          </View>
          <StatusBadge
            label={snapshot.device.online ? 'Online' : 'Offline'}
            tone={snapshot.device.online ? 'success' : 'danger'}
          />
        </View>
        <View style={styles.deviceMetrics}>
          <View style={styles.deviceMetric}>
            <Text style={styles.metricIcon}>◉</Text>
            <View>
              <Text style={styles.metricValue}>
                {snapshot.device.foodLevelPercent}%
              </Text>
              <Text style={styles.metricLabel}>Food level</Text>
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.deviceMetric}>
            <Text style={styles.metricIcon}>⌁</Text>
            <View>
              <Text style={styles.metricValue}>
                {snapshot.device.wifiStrengthPercent}%
              </Text>
              <Text style={styles.metricLabel}>Wi-Fi signal</Text>
            </View>
          </View>
        </View>
        <View style={styles.modeRow}>
          <Text style={styles.modeLabel}>SYSTEM FEEDING MODE</Text>
          <View style={styles.modePill}>
            <Text style={styles.modeValue}>
              {snapshot.device.operatingMode === 'automatic'
                ? 'AUTO'
                : 'MANUAL'}
            </Text>
          </View>
        </View>
      </Card>

      <SectionTitle title="Live AI detection" />
      <Card style={styles.detectionCard}>
        <View style={styles.detectionVisual}>
          <Text style={styles.petEmoji}>{detectedProfile?.emoji ?? '🐾'}</Text>
          <View style={styles.scanDot} />
        </View>
        <View style={styles.detectionCopy}>
          <Text style={styles.detectedLabel}>Detected species</Text>
          <Text style={styles.detectedName}>
            {detectedProfile?.displayName ?? 'Unknown'}
          </Text>
          <Text style={styles.foodType} numberOfLines={1}>
            {detectedProfile?.foodType ?? 'No food profile'}
          </Text>
          <View style={styles.confidenceRow}>
            <View style={styles.confidenceTrack}>
              <View
                style={[
                  styles.confidenceFill,
                  {
                    width: `${Math.round(
                      snapshot.detection.confidence * 100,
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.confidenceText}>
              {Math.round(snapshot.detection.confidence * 100)}%
            </Text>
          </View>
          <Text style={styles.updated}>
            Updated {formatTimeAgo(snapshot.detection.capturedAt)}
          </Text>
        </View>
      </Card>

      <View style={styles.quickRow}>
        <Card style={styles.quickCard}>
          <Text style={styles.quickIcon}>◷</Text>
          <Text style={styles.quickLabel}>Next feeding</Text>
          <Text style={styles.quickValue}>{nextSchedule?.time ?? '—'}</Text>
          <Text style={styles.quickHint}>
            {nextProfile?.displayName ?? 'No schedule'}
          </Text>
        </Card>
        <Card style={styles.quickCard}>
          <Text style={styles.quickIcon}>✓</Text>
          <Text style={styles.quickLabel}>Last feeding</Text>
          <Text style={styles.quickValue}>
            {lastFeeding ? `${lastFeeding.actualGrams} g` : '—'}
          </Text>
          <Text style={styles.quickHint}>
            {lastFeeding ? formatTimeAgo(lastFeeding.timestamp) : 'No data'}
          </Text>
        </Card>
      </View>

      <PrimaryButton label="Feed now" onPress={() => navigate('feed')} />

      <SectionTitle
        actionLabel="View history"
        onAction={() => navigate('history')}
        title="Recent activity"
      />
      {snapshot.history.slice(0, 3).map(item => {
        const profile = findProfile(snapshot.profiles, item.speciesId);
        return (
          <Pressable
            key={item.id}
            onPress={() => navigate('history')}
            style={styles.activityRow}
          >
            <View style={styles.activityEmoji}>
              <Text style={styles.activityEmojiText}>{profile?.emoji}</Text>
            </View>
            <View style={styles.activityCopy}>
              <Text style={styles.activityTitle}>
                {profile?.displayName} · {item.actualGrams} g
              </Text>
              <Text style={styles.activityMeta}>
                {item.mode === 'automatic' ? 'Automatic' : 'Manual'} ·{' '}
                {formatTimeAgo(item.timestamp)}
              </Text>
            </View>
            <Text
              style={
                item.result === 'completed' ? styles.success : styles.failure
              }
            >
              {item.result === 'completed' ? '✓' : '!'}
            </Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  deviceCard: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: {
    color: '#9FD5C8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  deviceName: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 5 },
  deviceMetrics: { flexDirection: 'row', marginTop: spacing.xl },
  deviceMetric: { alignItems: 'center', flex: 1, flexDirection: 'row' },
  metricIcon: { color: colors.accent, fontSize: 24, marginRight: spacing.md },
  metricValue: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  metricLabel: { color: '#B8D7D0', fontSize: 11, marginTop: 2 },
  separator: { backgroundColor: 'rgba(255,255,255,0.16)', width: 1 },
  modeRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.14)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  modeLabel: { color: '#9FD5C8', fontSize: 10, fontWeight: '800' },
  modePill: {
    backgroundColor: 'rgba(244,166,58,0.18)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  modeValue: { color: colors.accent, fontSize: 11, fontWeight: '900' },
  detectionCard: { alignItems: 'center', flexDirection: 'row' },
  detectionVisual: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    height: 104,
    justifyContent: 'center',
    marginRight: spacing.lg,
    position: 'relative',
    width: 104,
  },
  petEmoji: { fontSize: 56 },
  scanDot: {
    backgroundColor: colors.success,
    borderColor: colors.surface,
    borderRadius: 8,
    borderWidth: 3,
    height: 16,
    position: 'absolute',
    right: 8,
    top: 8,
    width: 16,
  },
  detectionCopy: { flex: 1 },
  detectedLabel: { color: colors.muted, fontSize: 12 },
  detectedName: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 2,
  },
  foodType: { color: colors.muted, fontSize: 10, marginTop: 2 },
  confidenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  confidenceTrack: {
    backgroundColor: colors.border,
    borderRadius: 4,
    flex: 1,
    height: 7,
    overflow: 'hidden',
  },
  confidenceFill: {
    backgroundColor: colors.success,
    borderRadius: 4,
    height: 7,
  },
  confidenceText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
  },
  updated: { color: colors.muted, fontSize: 10, marginTop: 7 },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  quickCard: { flex: 1, padding: spacing.md },
  quickIcon: { color: colors.primary, fontSize: 21 },
  quickLabel: { color: colors.muted, fontSize: 11, marginTop: spacing.sm },
  quickValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  quickHint: { color: colors.muted, fontSize: 10, marginTop: 2 },
  activityRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: spacing.md,
  },
  activityEmoji: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 40,
  },
  activityEmojiText: { fontSize: 22 },
  activityCopy: { flex: 1 },
  activityTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  activityMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  success: { color: colors.success, fontSize: 20, fontWeight: '900' },
  failure: { color: colors.danger, fontSize: 20, fontWeight: '900' },
});
