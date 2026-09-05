import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SpeciesSelector } from '../components/SpeciesSelector';
import { useFeeder } from '../context/FeederContext';
import { colors, radii, spacing } from '../theme';
import { SpeciesId, SpeciesProfile } from '../types/models';

interface StepperProps {
  label: string;
  hint: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function Stepper({
  label,
  hint,
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: StepperProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingHint}>{hint}</Text>
      </View>
      <View style={styles.stepper}>
        <Text
          onPress={() => onChange(Math.max(min, value - step))}
          style={styles.stepButton}
        >
          −
        </Text>
        <Text style={styles.stepValue}>
          {value} {unit}
        </Text>
        <Text
          onPress={() => onChange(Math.min(max, value + step))}
          style={styles.stepButton}
        >
          +
        </Text>
      </View>
    </View>
  );
}

export function SpeciesSettingsScreen() {
  const { snapshot, updateProfile } = useFeeder();
  const [selectedId, setSelectedId] = useState<SpeciesId>('cat');
  const selected = useMemo(
    () => snapshot?.profiles.find(item => item.id === selectedId),
    [selectedId, snapshot?.profiles],
  );
  const [draft, setDraft] = useState<SpeciesProfile | null>(selected ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDraft(selected ?? null);
    setSaved(false);
    setSaveError('');
  }, [selected]);

  if (!snapshot || !draft) {
    return null;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const consumedToday = snapshot.history
    .filter(
      item =>
        item.speciesId === selectedId &&
        item.result === 'completed' &&
        new Date(item.timestamp).getTime() >= startOfToday.getTime(),
    )
    .reduce((sum, item) => sum + item.actualGrams, 0);
  const activeSchedules = snapshot.schedules.filter(
    item => item.speciesId === selectedId && item.enabled,
  ).length;

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await updateProfile(draft);
      setSaved(true);
    } catch (error) {
      setSaved(false);
      setSaveError(
        error instanceof Error ? error.message : 'Unable to save the profile.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        subtitle="Set safe portions for each detected species"
        title="Species profiles"
      />
      <SpeciesSelector
        onSelect={setSelectedId}
        profiles={snapshot.profiles}
        selectedId={selectedId}
      />

      <Card style={styles.profileCard}>
        <View style={styles.profileTop}>
          <View style={styles.largeEmoji}>
            <Text style={styles.largeEmojiText}>{draft.emoji}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>{draft.displayName}</Text>
            <Text style={styles.profileDescription}>{draft.description}</Text>
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.settingLabel}>Food type</Text>
        <Text style={styles.settingHint}>
          Food stored in the dispenser for this species
        </Text>
        <TextInput
          onChangeText={foodType => setDraft({ ...draft, foodType })}
          placeholder="Example: Adult cat dry food"
          placeholderTextColor={colors.muted}
          style={styles.foodInput}
          value={draft.foodType}
        />
        <View style={styles.thinDivider} />
        <Stepper
          hint="Amount dispensed per feeding"
          label="Portion size"
          max={200}
          min={5}
          onChange={portionGrams => setDraft({ ...draft, portionGrams })}
          step={5}
          unit="g"
          value={draft.portionGrams}
        />
        <View style={styles.thinDivider} />
        <Stepper
          hint="Maximum food allowed in 24 hours"
          label="Daily limit"
          max={600}
          min={20}
          onChange={dailyLimitGrams => setDraft({ ...draft, dailyLimitGrams })}
          step={10}
          unit="g"
          value={draft.dailyLimitGrams}
        />
        <View style={styles.thinDivider} />

        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Automatic feeding</Text>
            <Text style={styles.settingHint}>
              Allow schedules after AI recognizes this species
            </Text>
          </View>
          <Switch
            onValueChange={autoFeedEnabled =>
              setDraft({ ...draft, autoFeedEnabled })
            }
            thumbColor="#FFF"
            trackColor={{ false: colors.border, true: colors.primary }}
            value={draft.autoFeedEnabled}
          />
        </View>
        <View style={styles.thinDivider} />
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Text style={styles.settingHint}>
              Receive success, failure and safety alerts
            </Text>
          </View>
          <Switch
            onValueChange={notificationsEnabled =>
              setDraft({ ...draft, notificationsEnabled })
            }
            thumbColor="#FFF"
            trackColor={{ false: colors.border, true: colors.primary }}
            value={draft.notificationsEnabled}
          />
        </View>
      </Card>

      <View style={styles.usageBox}>
        <View>
          <Text style={styles.usageValue}>
            {consumedToday}/{draft.dailyLimitGrams} g
          </Text>
          <Text style={styles.usageLabel}>Consumed today</Text>
        </View>
        <View style={styles.usageDivider} />
        <View>
          <Text style={styles.usageValue}>{activeSchedules}</Text>
          <Text style={styles.usageLabel}>Active schedules</Text>
        </View>
      </View>

      {saved ? (
        <Text style={styles.saved}>✓ Profile saved successfully</Text>
      ) : null}
      {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      <PrimaryButton
        disabled={!draft.foodType.trim()}
        label="Save profile"
        loading={saving}
        onPress={save}
      />
      <Text style={styles.disclaimer}>
        Suggested amounts are demo values. Actual portions should be confirmed
        with a veterinarian.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: { marginBottom: spacing.lg, marginTop: spacing.xl },
  profileTop: { alignItems: 'center', flexDirection: 'row' },
  largeEmoji: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    height: 74,
    justifyContent: 'center',
    marginRight: spacing.lg,
    width: 74,
  },
  largeEmojiText: { fontSize: 40 },
  profileCopy: { flex: 1 },
  profileName: { color: colors.text, fontSize: 22, fontWeight: '900' },
  profileDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.xl,
  },
  thinDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.lg,
  },
  settingRow: { alignItems: 'center', flexDirection: 'row' },
  settingCopy: { flex: 1, marginRight: spacing.md },
  settingLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  settingHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  foodInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    height: 50,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radii.md,
    flexDirection: 'row',
    padding: 4,
  },
  stepButton: {
    backgroundColor: colors.surface,
    borderRadius: 9,
    color: colors.primary,
    fontSize: 20,
    fontWeight: '700',
    height: 34,
    lineHeight: 32,
    textAlign: 'center',
    width: 34,
  },
  stepValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 58,
    textAlign: 'center',
  },
  saved: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  saveError: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  usageBox: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  usageValue: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  usageLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  usageDivider: { backgroundColor: '#BBDCD4', height: 32, width: 1 },
  disclaimer: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
