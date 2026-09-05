import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useFeeder } from '../context/FeederContext';
import { NavigationProps } from '../navigation';
import { colors, radii, spacing } from '../theme';
import { formatTimeAgo } from '../utils/format';

interface DetailRowProps {
  label: string;
  value: string;
  last?: boolean;
}

function DetailRow({ label, value, last = false }: DetailRowProps) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function DeviceSettingsScreen({ goBack }: NavigationProps) {
  const { snapshot, updateDeviceName, updateOperatingMode } = useFeeder();
  const [name, setName] = useState(snapshot?.device.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  if (!snapshot) {
    return null;
  }

  const saveName = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      return;
    }
    setSaving(true);
    try {
      await updateDeviceName(cleanName);
      setSaved(true);
    } catch (error) {
      Alert.alert(
        'Firebase update failed',
        error instanceof Error
          ? error.message
          : 'Unable to update the device name.',
      );
    } finally {
      setSaving(false);
    }
  };

  const changeMode = async (mode: 'automatic' | 'manual') => {
    if (mode === snapshot.device.operatingMode) {
      return;
    }
    setModeSaving(true);
    try {
      await updateOperatingMode(mode);
    } catch (error) {
      Alert.alert(
        'Firebase update failed',
        error instanceof Error
          ? error.message
          : 'Unable to update the operating mode.',
      );
    } finally {
      setModeSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        onBack={goBack}
        subtitle="Connectivity, firmware and edge AI"
        title="Device settings"
      />
      <Card style={styles.heroCard}>
        <View style={styles.deviceIcon}>
          <Text style={styles.deviceIconText}>◉</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroName}>{snapshot.device.name}</Text>
          <Text style={styles.heroId}>ID: {snapshot.device.id}</Text>
          <StatusBadge
            label={snapshot.device.online ? 'Online' : 'Offline'}
            tone={snapshot.device.online ? 'success' : 'danger'}
          />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Operating mode</Text>
      <Card>
        <View style={styles.modeSelector}>
          {(['automatic', 'manual'] as const).map(mode => {
            const active = snapshot.device.operatingMode === mode;
            return (
              <Pressable
                disabled={modeSaving}
                key={mode}
                onPress={() => changeMode(mode)}
                style={[styles.modeOption, active && styles.modeOptionActive]}
              >
                <Text
                  style={[styles.modeText, active && styles.modeTextActive]}
                >
                  {mode === 'automatic' ? 'AUTO' : 'MANUAL'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.modeHint}>
          {snapshot.device.operatingMode === 'automatic'
            ? 'Enabled species schedules can trigger feeding automatically.'
            : 'Automatic schedules are paused; Feed Now remains available.'}
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Device name</Text>
      <Card>
        <TextInput
          onChangeText={value => {
            setName(value);
            setSaved(false);
          }}
          placeholder="Device name"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={name}
        />
        <PrimaryButton
          disabled={!name.trim() || name.trim() === snapshot.device.name}
          label={saved ? 'Saved' : 'Save device name'}
          loading={saving}
          onPress={saveName}
          style={styles.saveButton}
        />
      </Card>

      <Text style={styles.sectionTitle}>Hardware status</Text>
      <Card>
        <DetailRow
          label="Food container"
          value={`${snapshot.device.foodLevelPercent}% full`}
        />
        <DetailRow
          label="Wi-Fi signal"
          value={`${snapshot.device.wifiStrengthPercent}%`}
        />
        <DetailRow
          label="Container lid"
          value={snapshot.device.lidClosed ? 'Closed' : 'Open'}
        />
        <DetailRow label="IP address" value={snapshot.device.ipAddress} />
        <DetailRow
          label="Last synchronized"
          value={formatTimeAgo(snapshot.device.lastSync)}
          last
        />
      </Card>

      <Text style={styles.sectionTitle}>Edge AI information</Text>
      <Card>
        <DetailRow label="AI processor" value="ESP32-S3 CAM" />
        <DetailRow
          label="Classification model"
          value={snapshot.device.aiModelName}
        />
        <DetailRow
          label="Classes supported"
          value={`${snapshot.profiles.length} species`}
        />
        <DetailRow
          label="Firmware version"
          value={snapshot.device.firmwareVersion}
          last
        />
      </Card>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>How data flows</Text>
        <Text style={styles.infoText}>
          ESP32-S3 CAM classifies the animal locally, then sends species and
          confidence to Firebase. This mobile app reads that result and applies
          the matching feeding profile.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: { alignItems: 'center', flexDirection: 'row' },
  deviceIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    height: 80,
    justifyContent: 'center',
    marginRight: spacing.lg,
    width: 80,
  },
  deviceIconText: { color: colors.primary, fontSize: 38 },
  heroCopy: { flex: 1 },
  heroName: { color: colors.text, fontSize: 19, fontWeight: '900' },
  heroId: {
    color: colors.muted,
    fontSize: 10,
    marginBottom: spacing.sm,
    marginTop: 3,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  modeSelector: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    flexDirection: 'row',
    padding: 4,
  },
  modeOption: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingVertical: spacing.md,
  },
  modeOptionActive: { backgroundColor: colors.primary },
  modeText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  modeTextActive: { color: '#FFF' },
  modeHint: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    height: 52,
    paddingHorizontal: spacing.lg,
  },
  saveButton: { marginTop: spacing.md },
  detailRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  detailRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  detailLabel: { color: colors.muted, flex: 1, fontSize: 12 },
  detailValue: {
    color: colors.text,
    flex: 1.2,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  infoBox: {
    backgroundColor: colors.infoSoft,
    borderRadius: radii.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  infoTitle: { color: colors.info, fontSize: 13, fontWeight: '900' },
  infoText: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 4 },
});
