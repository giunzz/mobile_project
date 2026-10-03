import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SpeciesSelector } from '../components/SpeciesSelector';
import { StatusBadge } from '../components/StatusBadge';
import { useFeeder } from '../context/FeederContext';
import { isDeviceReady } from '../firebase/deviceContract';
import { colors, radii, spacing } from '../theme';
import { SpeciesId } from '../types/models';
import { formatDateTime } from '../utils/format';
import { useNow } from '../utils/useNow';
import { measuredTodayGrams } from '../utils/feedingDay';

export function FeedNowScreen() {
  const { snapshot, feedNow } = useFeeder();
  const now = useNow();
  const [selectedId, setSelectedId] = useState<SpeciesId>('dog');
  const selected = snapshot?.profiles.find(item => item.id === selectedId);
  const [amount, setAmount] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState('');
  const [error, setError] = useState('');
  if (!snapshot || !selected) {
    return null;
  }

  const grams = Number(amount ?? selected.portionGrams);
  const command = snapshot.commands[0];
  const inFlight =
    command?.status === 'pending' || command?.status === 'processing';
  const waitingLong = inFlight && now - Date.parse(command.requestedAt) > 30000;
  const cooldown = snapshot.runtime.cooldownUntilMs[selectedId];
  const secondsLeft =
    cooldown === null ? null : Math.max(0, Math.ceil((cooldown - now) / 1000));
  const measuredToday = measuredTodayGrams(snapshot.history, selectedId, now);
  const blocked = !isDeviceReady(snapshot, now)
    ? 'Waiting for a recent, healthy feeder heartbeat'
    : inFlight
    ? 'A command is still pending or processing'
    : !['idle', 'completed', 'failed'].includes(snapshot.runtime.feeding.status)
    ? 'Feeder busy or runtime unavailable'
    : !selected.configValid
    ? 'Save a valid species profile first'
    : secondsLeft === null
    ? 'Cooldown has not been reported'
    : secondsLeft > 0
    ? `Cooldown: ${secondsLeft} seconds remaining`
    : !Number.isFinite(grams) || grams <= 0
    ? 'Enter a positive portion'
    : grams + measuredToday > selected.dailyLimitGrams
    ? 'Portion exceeds the available daily limit'
    : '';
  const matchedHistory =
    command && snapshot.history.find(item => item.requestId === command.id);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const result = await feedNow({
        speciesId: selectedId,
        targetGrams: grams,
      });
      setSentId(result.command.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to confirm the request. Check command status before trying again.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Feed now"
        subtitle="Send a request and follow the ESP32 response"
      />
      <StatusBadge
        label={
          isDeviceReady(snapshot, now)
            ? 'Feeder connected'
            : 'Feeder unavailable'
        }
        tone={isDeviceReady(snapshot, now) ? 'success' : 'warning'}
      />
      <Text style={styles.label}>Choose feeder</Text>
      <SpeciesSelector
        profiles={snapshot.profiles}
        selectedId={selectedId}
        onSelect={id => {
          setSelectedId(id);
          setAmount(null);
          setError('');
        }}
      />
      <Card style={styles.card}>
        <Text style={styles.title}>
          {selected.emoji} {selected.displayName}
        </Text>
        <Text style={styles.hint}>{selected.description}</Text>
        <Text style={styles.label}>Portion (grams)</Text>
        <TextInput
          accessibilityLabel="Portion in grams"
          keyboardType="decimal-pad"
          editable={!sending}
          value={amount ?? String(selected.portionGrams)}
          onChangeText={setAmount}
          style={styles.input}
        />
        <Text style={styles.hint}>
          Recorded today: {measuredToday} g · Daily limit:{' '}
          {selected.dailyLimitGrams} g
        </Text>
        <Text style={styles.hint}>
          Totals include received, dated history only. The feeder enforces its
          own limits.
        </Text>
      </Card>
      {blocked ? <Text style={styles.notice}>{blocked}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label={`Request ${Number.isFinite(grams) ? grams : '—'} g`}
        loading={sending}
        disabled={Boolean(blocked)}
        onPress={() =>
          Alert.alert(
            'Confirm feeding',
            `Request ${grams} g for ${selected.displayName} (${
              selectedId === 'dog' ? 'feeder 1' : 'feeder 2'
            })?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Send request', onPress: send },
            ],
          )
        }
      />
      {sentId ? (
        <Text selectable style={styles.hint}>
          Request saved to Firebase: {sentId}. Completion must be reported by
          ESP32.
        </Text>
      ) : null}
      <Card style={styles.card}>
        <Text style={styles.title}>Latest shared command</Text>
        {command ? (
          <>
            <StatusBadge
              label={command.status.toUpperCase()}
              tone={
                command.status === 'completed'
                  ? 'success'
                  : command.status === 'failed'
                  ? 'danger'
                  : 'info'
              }
            />
            <Text style={styles.label}>
              {command.speciesId.toUpperCase()} · requested{' '}
              {command.targetGrams} g
            </Text>
            <Text selectable style={styles.hint}>
              ID: {command.id}
            </Text>
            <Text style={styles.hint}>
              Requested: {formatDateTime(command.requestedAt)}
            </Text>
            <Text style={styles.hint}>
              {command.status === 'pending'
                ? 'Saved. Waiting for ESP32 to accept the request.'
                : command.status === 'processing'
                ? 'ESP32 is processing this request.'
                : command.status === 'completed'
                ? 'ESP32 reported completion.'
                : 'ESP32 reported failure.'}
            </Text>
            {matchedHistory ? (
              <Text style={styles.label}>
                Matching history: {matchedHistory.actualGrams} g measured
              </Text>
            ) : (
              <Text style={styles.hint}>No matching measured history yet.</Text>
            )}
            {waitingLong ? (
              <Text style={styles.notice}>
                Still waiting for ESP32. Do not resend: the request may still be
                executed. Check the device connection.
              </Text>
            ) : null}
            {sentId && sentId !== command.id ? (
              <Text style={styles.notice}>
                The shared command slot now contains another request. Check
                history for your request ID.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.hint}>
            No supported feed command has been reported.
          </Text>
        )}
      </Card>
      <Card style={styles.card}>
        <Text style={styles.title}>Live feeder measurement</Text>
        <Text style={styles.label}>
          {snapshot.runtime.feeding.activeSpecies.toUpperCase()} ·{' '}
          {snapshot.runtime.feeding.status}
        </Text>
        <Text style={styles.measurement}>
          {snapshot.runtime.feeding.actualGrams ?? '—'} g
        </Text>
        <Text style={styles.hint}>
          Live runtime value. This is separate from the measured history of a
          specific request.
        </Text>
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { marginVertical: spacing.lg, gap: spacing.sm },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  label: { color: colors.text, fontWeight: '700', marginVertical: spacing.md },
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 28,
  },
  notice: { color: colors.warning, lineHeight: 20, marginBottom: spacing.md },
  error: { color: colors.danger, lineHeight: 20, marginBottom: spacing.md },
  measurement: { color: colors.primary, fontSize: 32, fontWeight: '800' },
});
