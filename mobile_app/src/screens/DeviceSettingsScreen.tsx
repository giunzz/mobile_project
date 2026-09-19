import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useFeeder } from '../context/FeederContext';
import { isDeviceReady } from '../firebase/deviceContract';
import { NavigationProps } from '../navigation';
import { colors, spacing } from '../theme';
import { formatDateTime } from '../utils/format';
import { useNow } from '../utils/useNow';

export function DeviceSettingsScreen({ goBack, navigate }: NavigationProps) {
  const { snapshot } = useFeeder();
  const now = useNow();
  if (!snapshot) {
    return null;
  }
  const { device, runtime } = snapshot;
  const rows: [string, string][] = [
    ['Device ID', device.id],
    ['Firebase connection', snapshot.connected ? 'Connected' : 'Disconnected'],
    ['Firmware online flag', device.online ? 'Online' : 'Offline'],
    ['Last heartbeat', formatDateTime(device.lastSync)],
    ['Error code', device.errorCode],
    ['Operating mode', device.operatingMode],
    ['Firmware', device.firmwareVersion],
    ['IP address', device.ipAddress || 'Not reported'],
    [
      'Wi-Fi RSSI',
      device.wifiRssi === null ? 'Not reported' : `${device.wifiRssi} dBm`,
    ],
    ['Feeding state', runtime.feeding.status],
    ['Active feeder', runtime.feeding.activeSpecies],
    [
      'Target',
      runtime.feeding.targetGrams === null
        ? 'Not reported'
        : `${runtime.feeding.targetGrams} g`,
    ],
    [
      'Measured amount',
      runtime.feeding.actualGrams === null
        ? 'Not reported'
        : `${runtime.feeding.actualGrams} g`,
    ],
    ['LED', runtime.feeding.ledOn ? 'On' : 'Off'],
  ];
  return (
    <Screen>
      <AppHeader
        title="Device status"
        subtitle="Reported by the ESP32"
        onBack={goBack}
      />
      <StatusBadge
        label={
          isDeviceReady(snapshot, now)
            ? 'Recent healthy heartbeat'
            : 'Feeder unavailable / stale'
        }
        tone={isDeviceReady(snapshot, now) ? 'success' : 'warning'}
      />
      <Card style={styles.card}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text selectable style={styles.value}>
              {value}
            </Text>
          </View>
        ))}
      </Card>
      <Card style={styles.card}>
        <Text style={styles.title}>Two separate feeders</Text>
        <Text style={styles.hint}>Dog: feeder 1 · servo 1 · load cell 1</Text>
        <Text style={styles.hint}>Cat: feeder 2 · servo 2 · load cell 2</Text>
        <Text style={styles.hint}>
          Device status is read-only. Set portions, cooldown and automatic
          feeding in Species profiles.
        </Text>
      </Card>
      <PrimaryButton
        label="Edit species profiles"
        onPress={() => navigate('profiles')}
      />
      <Text style={styles.hint}>
        AI detection is unavailable until the Edge AI integration sends results.
        Firmware V1 can operate without AI.
      </Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { marginVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  label: { color: colors.muted, flex: 1 },
  value: { color: colors.text, flex: 1, textAlign: 'right', fontWeight: '600' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.muted, lineHeight: 20, marginTop: spacing.md },
});
