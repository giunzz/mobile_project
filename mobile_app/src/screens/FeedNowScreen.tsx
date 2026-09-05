import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SpeciesSelector } from '../components/SpeciesSelector';
import { StatusBadge } from '../components/StatusBadge';
import { useFeeder } from '../context/FeederContext';
import { colors, radii, spacing } from '../theme';
import { FeedingCommandStatus, SpeciesId } from '../types/models';

const statusOrder: FeedingCommandStatus[] = [
  'pending',
  'processing',
  'completed',
];

export function FeedNowScreen() {
  const { snapshot, feedNow } = useFeeder();
  const [selectedId, setSelectedId] = useState<SpeciesId>('cat');
  const selected = useMemo(
    () => snapshot?.profiles.find(item => item.id === selectedId),
    [selectedId, snapshot?.profiles],
  );
  const [grams, setGrams] = useState(selected?.portionGrams ?? 45);
  const [feeding, setFeeding] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [lastResult, setLastResult] = useState<
    'completed' | 'rejected' | 'failed' | null
  >(null);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const consumedToday =
    snapshot?.history
      .filter(
        item =>
          item.speciesId === selectedId &&
          item.result === 'completed' &&
          new Date(item.timestamp).getTime() >= startOfToday.getTime(),
      )
      .reduce((sum, item) => sum + item.actualGrams, 0) ?? 0;
  const remainingToday = Math.max(
    0,
    (selected?.dailyLimitGrams ?? 0) - consumedToday,
  );

  if (!snapshot || !selected) {
    return null;
  }

  const latestCommand = snapshot.commands[0];
  const runFeed = async () => {
    setFeeding(true);
    setLastResult(null);
    setResultMessage('');
    try {
      const result = await feedNow({
        speciesId: selectedId,
        targetGrams: grams,
      });
      if (result.command.status === 'completed') {
        setLastResult('completed');
        setResultMessage(
          `${result.history.actualGrams} g was measured by the load-cell simulation.`,
        );
      } else {
        setLastResult('rejected');
        setResultMessage(
          result.command.errorMessage ?? 'The feeding request was rejected.',
        );
      }
    } catch (error) {
      setLastResult('failed');
      setResultMessage(
        error instanceof Error ? error.message : 'The feeding command failed.',
      );
    } finally {
      setFeeding(false);
    }
  };

  const confirmFeed = () =>
    Alert.alert(
      'Confirm manual feeding',
      `Dispense ${grams} g of ${selected.foodType} for ${selected.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Feed now', onPress: runFeed },
      ],
    );

  const commandStatus = latestCommand?.status;
  const isRejected = commandStatus === 'rejected' || commandStatus === 'failed';

  return (
    <Screen>
      <AppHeader
        subtitle="Send and monitor a manual Firebase command"
        title="Feed now"
      />

      <View style={styles.statusRow}>
        <StatusBadge
          label={snapshot.device.online ? 'Device ready' : 'Device offline'}
          tone={snapshot.device.online ? 'success' : 'danger'}
        />
        <Text style={styles.foodText}>
          Food remaining: {snapshot.device.foodLevelPercent}%
        </Text>
      </View>

      <Text style={styles.label}>Choose species profile</Text>
      <SpeciesSelector
        onSelect={id => {
          const nextProfile = snapshot.profiles.find(item => item.id === id);
          setSelectedId(id);
          setGrams(nextProfile?.portionGrams ?? 5);
          setLastResult(null);
          setResultMessage('');
        }}
        profiles={snapshot.profiles}
        selectedId={selectedId}
      />

      <Card style={styles.amountCard}>
        <Text style={styles.selectedEmoji}>{selected.emoji}</Text>
        <Text style={styles.amountLabel}>{selected.foodType}</Text>
        <View style={styles.amountRow}>
          <Text
            onPress={() => setGrams(value => Math.max(5, value - 5))}
            style={styles.amountButton}
          >
            −
          </Text>
          <View style={styles.amountCenter}>
            <Text style={styles.amountValue}>{grams}</Text>
            <Text style={styles.grams}>grams</Text>
          </View>
          <Text
            onPress={() =>
              setGrams(value => Math.min(remainingToday, value + 5))
            }
            style={styles.amountButton}
          >
            +
          </Text>
        </View>
        <View style={styles.limitBox}>
          <Text style={styles.limitText}>
            Today: {consumedToday} g consumed · {remainingToday} g remaining ·
            Daily limit: {selected.dailyLimitGrams} g
          </Text>
        </View>
      </Card>

      {(feeding || lastResult) && latestCommand ? (
        <Card style={styles.commandCard}>
          <Text style={styles.commandTitle}>Command status</Text>
          <Text style={styles.commandId}>ID: {latestCommand.id}</Text>
          <View style={styles.timeline}>
            {statusOrder.map((status, index) => {
              const currentIndex = statusOrder.indexOf(
                commandStatus === 'rejected' || commandStatus === 'failed'
                  ? 'processing'
                  : commandStatus ?? 'pending',
              );
              const reached = index <= currentIndex;
              return (
                <View key={status} style={styles.timelineStep}>
                  <View
                    style={[
                      styles.timelineDot,
                      reached && styles.timelineDotActive,
                      index === 2 && isRejected && styles.timelineDotError,
                    ]}
                  >
                    <Text style={styles.timelineDotText}>
                      {index === 2 && isRejected ? '!' : reached ? '✓' : ''}
                    </Text>
                  </View>
                  <Text style={styles.timelineLabel}>
                    {index === 2 && isRejected
                      ? 'Rejected'
                      : status.charAt(0).toUpperCase() + status.slice(1)}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {lastResult ? (
        <View
          style={[
            styles.resultBox,
            lastResult !== 'completed' && styles.resultBoxError,
          ]}
        >
          <Text
            style={[
              styles.resultIcon,
              lastResult !== 'completed' && styles.resultIconError,
            ]}
          >
            {lastResult === 'completed' ? '✓' : '!'}
          </Text>
          <View style={styles.resultCopy}>
            <Text
              style={[
                styles.resultTitle,
                lastResult !== 'completed' && styles.resultTitleError,
              ]}
            >
              {lastResult === 'completed'
                ? 'Feeding completed'
                : 'Command not completed'}
            </Text>
            <Text style={styles.resultText}>{resultMessage}</Text>
          </View>
        </View>
      ) : null}

      <PrimaryButton
        disabled={
          !snapshot.device.online ||
          remainingToday < grams ||
          remainingToday < 5
        }
        label={
          remainingToday < 5
            ? 'Daily limit reached'
            : feeding
            ? 'Processing command…'
            : `Dispense ${grams} g`
        }
        loading={feeding}
        onPress={confirmFeed}
      />
      <Text style={styles.safety}>
        Every request is checked against connectivity and the species' actual
        daily consumption before it is sent.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  foodText: { color: colors.muted, fontSize: 11 },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  amountCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  selectedEmoji: { fontSize: 48 },
  amountLabel: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: spacing.xl,
  },
  amountButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: 28,
    color: colors.primary,
    fontSize: 30,
    fontWeight: '700',
    height: 56,
    lineHeight: 52,
    textAlign: 'center',
    width: 56,
  },
  amountCenter: { alignItems: 'center', minWidth: 130 },
  amountValue: {
    color: colors.text,
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 52,
  },
  grams: { color: colors.muted, fontSize: 12 },
  limitBox: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.md,
    width: '100%',
  },
  limitText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  commandCard: { marginBottom: spacing.lg },
  commandTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  commandId: { color: colors.muted, fontSize: 9, marginTop: 2 },
  timeline: { flexDirection: 'row', marginTop: spacing.lg },
  timelineStep: { alignItems: 'center', flex: 1 },
  timelineDot: {
    alignItems: 'center',
    backgroundColor: colors.border,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  timelineDotActive: { backgroundColor: colors.primary },
  timelineDotError: { backgroundColor: colors.danger },
  timelineDotText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  timelineLabel: { color: colors.muted, fontSize: 9, marginTop: 5 },
  resultBox: {
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  resultBoxError: { backgroundColor: colors.dangerSoft },
  resultIcon: {
    color: colors.success,
    fontSize: 28,
    fontWeight: '900',
    marginRight: spacing.md,
  },
  resultIconError: { color: colors.danger },
  resultCopy: { flex: 1 },
  resultTitle: { color: colors.success, fontSize: 14, fontWeight: '800' },
  resultTitleError: { color: colors.danger },
  resultText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  safety: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
