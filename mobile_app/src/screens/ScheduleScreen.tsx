import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SpeciesSelector } from '../components/SpeciesSelector';
import { useFeeder } from '../context/FeederContext';
import { colors, radii, spacing } from '../theme';
import { SpeciesId } from '../types/models';
import { findProfile } from '../utils/format';

export function ScheduleScreen() {
  const {
    snapshot,
    addSchedule,
    updateSchedule,
    toggleSchedule,
    deleteSchedule,
  } = useFeeder();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<SpeciesId>('cat');
  const [time, setTime] = useState('08:00');
  const [portion, setPortion] = useState('45');
  const [saving, setSaving] = useState(false);

  if (!snapshot) {
    return null;
  }

  const beginAdd = () => {
    const profile = findProfile(snapshot.profiles, selectedId);
    setEditingId(null);
    setTime('08:00');
    setPortion(String(profile?.portionGrams ?? 45));
    setAdding(true);
  };

  const beginEdit = (id: string) => {
    const schedule = snapshot.schedules.find(item => item.id === id);
    if (!schedule) {
      return;
    }
    setEditingId(id);
    setSelectedId(schedule.speciesId);
    setTime(schedule.time);
    setPortion(String(schedule.portionGrams));
    setAdding(true);
  };

  const createSchedule = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      Alert.alert(
        'Invalid time',
        'Use the 24-hour format HH:MM, for example 08:30.',
      );
      return;
    }
    const parsedPortion = Number(portion);
    if (!Number.isFinite(parsedPortion) || parsedPortion < 5) {
      Alert.alert('Invalid portion', 'Enter a portion of at least 5 grams.');
      return;
    }
    setSaving(true);
    const original = editingId
      ? snapshot.schedules.find(item => item.id === editingId)
      : undefined;
    const schedule = {
      id: editingId ?? '',
      speciesId: selectedId,
      time,
      portionGrams: parsedPortion,
      repeatLabel: original?.repeatLabel ?? 'Every day',
      enabled: original?.enabled ?? false,
    };
    try {
      if (editingId) {
        await updateSchedule(schedule);
      } else {
        await addSchedule(schedule);
      }
      setAdding(false);
      setEditingId(null);
    } catch (error) {
      Alert.alert(
        'Firebase update failed',
        error instanceof Error ? error.message : 'Unable to save the schedule.',
      );
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = async (id: string) => {
    try {
      await deleteSchedule(id);
    } catch (error) {
      Alert.alert(
        'Firebase update failed',
        error instanceof Error
          ? error.message
          : 'Unable to delete the schedule.',
      );
    }
  };

  const changeScheduleState = async (id: string, enabled: boolean) => {
    try {
      await toggleSchedule(id, enabled);
    } catch (error) {
      Alert.alert(
        'Firebase update failed',
        error instanceof Error
          ? error.message
          : 'Unable to update the schedule.',
      );
    }
  };

  const confirmDelete = (id: string) =>
    Alert.alert(
      'Delete schedule?',
      'This automatic feeding time will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeSchedule(id).catch(() => undefined);
          },
        },
      ],
    );

  return (
    <Screen>
      <AppHeader
        actionLabel={adding ? 'Cancel' : '+ Add'}
        onAction={() => {
          if (adding) {
            setAdding(false);
            setEditingId(null);
          } else {
            beginAdd();
          }
        }}
        subtitle="Shared schedules for the dog and cat feeders"
        title="Schedule"
      />

      <Text style={styles.scheduleMeta}>
        Times use the ESP32 clock. New schedules start disabled; enable them
        when ready. The firmware runs scheduled feeds.
      </Text>

      {adding ? (
        <Card style={styles.addCard}>
          <Text style={styles.cardTitle}>
            {editingId ? 'Edit feeding schedule' : 'New feeding schedule'}
          </Text>
          <Text style={styles.fieldLabel}>Species profile</Text>
          {editingId ? (
            <Text style={styles.fieldLabel}>
              {selectedId.toUpperCase()} ·{' '}
              {selectedId === 'dog' ? 'Feeder 1' : 'Feeder 2'} (fixed)
            </Text>
          ) : (
            <SpeciesSelector
              onSelect={id => {
                setSelectedId(id);
                const profile = findProfile(snapshot.profiles, id);
                setPortion(String(profile?.portionGrams ?? 45));
              }}
              profiles={snapshot.profiles}
              selectedId={selectedId}
            />
          )}
          <View style={styles.fieldsRow}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Time (24h)</Text>
              <TextInput
                maxLength={5}
                onChangeText={setTime}
                placeholder="08:00"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={time}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Portion (g)</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setPortion}
                placeholder="45"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={portion}
              />
            </View>
          </View>
          <View style={styles.repeatBox}>
            <Text style={styles.repeatLabel}>Repeat</Text>
            <Text style={styles.repeatValue}>Every day</Text>
          </View>
          <PrimaryButton
            disabled={!snapshot.connected}
            label={editingId ? 'Save changes' : 'Create schedule'}
            loading={saving}
            onPress={createSchedule}
          />
        </Card>
      ) : null}

      <View style={styles.summaryRow}>
        <View>
          <Text style={styles.summaryValue}>{snapshot.schedules.length}</Text>
          <Text style={styles.summaryLabel}>Total schedules</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View>
          <Text style={styles.summaryValue}>
            {snapshot.schedules.filter(item => item.enabled).length}
          </Text>
          <Text style={styles.summaryLabel}>Enabled in Firebase</Text>
        </View>
      </View>

      {snapshot.schedules
        .slice()
        .sort((a, b) => a.time.localeCompare(b.time))
        .map(schedule => {
          const profile = findProfile(snapshot.profiles, schedule.speciesId);
          return (
            <Card
              key={schedule.id}
              style={[
                styles.scheduleCard,
                !schedule.enabled && styles.disabledCard,
              ]}
            >
              <View style={styles.scheduleMain}>
                <View style={styles.timeBox}>
                  <Text style={styles.time}>{schedule.time}</Text>
                </View>
                <View style={styles.scheduleCopy}>
                  <Text style={styles.scheduleTitle}>
                    {profile?.emoji} {profile?.displayName}
                  </Text>
                  <Text style={styles.scheduleMeta}>
                    {schedule.portionGrams} g · {schedule.repeatLabel}
                  </Text>
                </View>
                <Switch
                  disabled={!snapshot.connected}
                  onValueChange={enabled =>
                    changeScheduleState(schedule.id, enabled)
                  }
                  thumbColor="#FFF"
                  trackColor={{ false: colors.border, true: colors.primary }}
                  value={schedule.enabled}
                />
              </View>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => beginEdit(schedule.id)}
                  style={styles.editButton}
                >
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(schedule.id)}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addCard: { marginBottom: spacing.xl },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  fieldsRow: { flexDirection: 'row', gap: spacing.md },
  field: { flex: 1 },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    height: 50,
    paddingHorizontal: spacing.md,
  },
  repeatBox: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radii.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  repeatLabel: { color: colors.muted, fontSize: 12 },
  repeatValue: { color: colors.text, fontSize: 12, fontWeight: '800' },
  summaryRow: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  summaryValue: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  summaryLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  summaryDivider: { backgroundColor: '#BBDCD4', height: 38, width: 1 },
  scheduleCard: { marginBottom: spacing.md, paddingBottom: 0 },
  disabledCard: { opacity: 0.62 },
  scheduleMain: { alignItems: 'center', flexDirection: 'row' },
  timeBox: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    justifyContent: 'center',
    marginRight: spacing.md,
    padding: spacing.md,
  },
  time: { color: colors.primaryDark, fontSize: 17, fontWeight: '900' },
  scheduleCopy: { flex: 1 },
  scheduleTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  scheduleMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  actionsRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    marginHorizontal: -spacing.lg,
    marginTop: spacing.lg,
  },
  editButton: { flex: 1, paddingVertical: spacing.md },
  deleteButton: {
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    flex: 1,
    paddingVertical: spacing.md,
  },
  editText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  deleteText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
