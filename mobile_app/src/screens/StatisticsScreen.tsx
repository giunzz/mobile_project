import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { SectionTitle } from '../components/SectionTitle';
import { useFeeder } from '../context/FeederContext';
import { NavigationProps } from '../navigation';
import { colors, radii, spacing } from '../theme';
import { FeedingHistory } from '../types/models';

type Period = 'day' | 'week';

interface ChartPoint {
  label: string;
  value: number;
}

const sumCompleted = (rows: FeedingHistory[]) =>
  rows
    .filter(item => item.result === 'completed')
    .reduce((sum, item) => sum + item.actualGrams, 0);

const buildChart = (
  history: FeedingHistory[],
  period: Period,
): ChartPoint[] => {
  const now = new Date();
  if (period === 'day') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 6 }, (_, index) => {
      const from = new Date(start.getTime() + index * 4 * 60 * 60 * 1000);
      const to = new Date(from.getTime() + 4 * 60 * 60 * 1000);
      return {
        label: `${String(index * 4).padStart(2, '0')}h`,
        value: sumCompleted(
          history.filter(item => {
            const timestamp = new Date(item.timestamp).getTime();
            return timestamp >= from.getTime() && timestamp < to.getTime();
          }),
        ),
      };
    });
  }

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    return {
      label: day.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2),
      value: sumCompleted(
        history.filter(item => {
          const timestamp = new Date(item.timestamp).getTime();
          return timestamp >= day.getTime() && timestamp < nextDay.getTime();
        }),
      ),
    };
  });
};

export function StatisticsScreen({ goBack }: NavigationProps) {
  const { snapshot } = useFeeder();
  const [period, setPeriod] = useState<Period>('week');
  if (!snapshot) {
    return null;
  }

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  if (period === 'week') {
    cutoff.setDate(cutoff.getDate() - 6);
  }
  const periodHistory = snapshot.history.filter(
    item => new Date(item.timestamp).getTime() >= cutoff.getTime(),
  );
  const successful = periodHistory.filter(item => item.result === 'completed');
  const totalGrams = sumCompleted(periodHistory);
  const automatic = successful.filter(item => item.mode === 'automatic').length;
  const maxSpeciesGrams = Math.max(
    1,
    ...snapshot.profiles.map(profile =>
      sumCompleted(periodHistory.filter(item => item.speciesId === profile.id)),
    ),
  );
  const chart = buildChart(snapshot.history, period);
  const maxChart = Math.max(1, ...chart.map(item => item.value));

  return (
    <Screen>
      <AppHeader
        onBack={goBack}
        subtitle="Daily and weekly feeding analytics"
        title="Statistics"
      />

      <View style={styles.periodSelector}>
        {(['day', 'week'] as Period[]).map(item => (
          <Pressable
            key={item}
            onPress={() => setPeriod(item)}
            style={[
              styles.periodOption,
              period === item && styles.periodOptionActive,
            ]}
          >
            <Text
              style={[
                styles.periodText,
                period === item && styles.periodTextActive,
              ]}
            >
              {item === 'day' ? 'Today' : 'Last 7 days'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.metrics}>
        <Card style={styles.metricCard}>
          <Text style={styles.metricIcon}>◉</Text>
          <Text style={styles.metricValue}>{totalGrams} g</Text>
          <Text style={styles.metricLabel}>Food dispensed</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricIcon}>✓</Text>
          <Text style={styles.metricValue}>{successful.length}</Text>
          <Text style={styles.metricLabel}>Completed feeds</Text>
        </Card>
      </View>

      <SectionTitle
        title={period === 'day' ? 'Today by time' : '7-day trend'}
      />
      <Card>
        <View style={styles.chart}>
          {chart.map(point => (
            <View key={point.label} style={styles.chartColumn}>
              <Text style={styles.chartValue}>{point.value || ''}</Text>
              <View style={styles.chartTrack}>
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: `${Math.max(4, (point.value / maxChart) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.chartLabel}>{point.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.modeCard}>
        <View style={styles.modeCopy}>
          <Text style={styles.modeTitle}>Feeding mode</Text>
          <Text style={styles.modeHint}>Completed commands in this period</Text>
        </View>
        <View style={styles.donut}>
          <Text style={styles.donutValue}>
            {successful.length
              ? Math.round((automatic / successful.length) * 100)
              : 0}
            %
          </Text>
          <Text style={styles.donutLabel}>Auto</Text>
        </View>
        <View style={styles.legend}>
          <Text style={styles.autoLegend}>● Automatic: {automatic}</Text>
          <Text style={styles.manualLegend}>
            ● Manual: {successful.length - automatic}
          </Text>
        </View>
      </Card>

      <SectionTitle title="Food by species" />
      <Card>
        {snapshot.profiles.map(profile => {
          const grams = sumCompleted(
            periodHistory.filter(item => item.speciesId === profile.id),
          );
          return (
            <View key={profile.id} style={styles.barRow}>
              <Text style={styles.barEmoji}>{profile.emoji}</Text>
              <View style={styles.barCopy}>
                <View style={styles.barLabels}>
                  <Text style={styles.barName}>{profile.displayName}</Text>
                  <Text style={styles.barValue}>{grams} g</Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.max(
                          2,
                          (grams / maxSpeciesGrams) * 100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </Card>

      <SectionTitle title="System performance" />
      <Card>
        <View style={styles.performanceRow}>
          <Text style={styles.performanceLabel}>Successful feed rate</Text>
          <Text style={styles.performanceValue}>
            {periodHistory.length
              ? Math.round((successful.length / periodHistory.length) * 100)
              : 0}
            %
          </Text>
        </View>
        <View style={styles.performanceRow}>
          <Text style={styles.performanceLabel}>AI confidence (latest)</Text>
          <Text style={styles.performanceValue}>
            {Math.round(snapshot.detection.confidence * 100)}%
          </Text>
        </View>
        <View style={styles.performanceRowLast}>
          <Text style={styles.performanceLabel}>Active schedules</Text>
          <Text style={styles.performanceValue}>
            {snapshot.schedules.filter(item => item.enabled).length}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  periodSelector: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: 4,
  },
  periodOption: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingVertical: spacing.md,
  },
  periodOptionActive: { backgroundColor: colors.primary },
  periodText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  periodTextActive: { color: '#FFF' },
  metrics: { flexDirection: 'row', gap: spacing.md },
  metricCard: { flex: 1 },
  metricIcon: { color: colors.primary, fontSize: 23 },
  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  metricLabel: { color: colors.muted, fontSize: 10, marginTop: 3 },
  chart: { flexDirection: 'row', height: 150 },
  chartColumn: { alignItems: 'center', flex: 1 },
  chartValue: { color: colors.muted, fontSize: 8, height: 15 },
  chartTrack: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    width: '62%',
  },
  chartBar: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    minHeight: 4,
    width: '100%',
  },
  chartLabel: { color: colors.muted, fontSize: 9, marginTop: 6 },
  modeCard: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  modeCopy: { flex: 1 },
  modeTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  modeHint: { color: colors.muted, fontSize: 10, marginTop: 3 },
  donut: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: 40,
    borderWidth: 9,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  donutValue: { color: colors.text, fontSize: 17, fontWeight: '900' },
  donutLabel: { color: colors.muted, fontSize: 9 },
  legend: { marginLeft: spacing.md },
  autoLegend: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  manualLegend: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
  barRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  barEmoji: { fontSize: 24, width: 38 },
  barCopy: { flex: 1 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  barName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  barValue: { color: colors.muted, fontSize: 11 },
  track: {
    backgroundColor: colors.border,
    borderRadius: 5,
    height: 9,
    marginTop: 7,
    overflow: 'hidden',
  },
  fill: { backgroundColor: colors.primary, borderRadius: 5, height: 9 },
  performanceRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  performanceRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  performanceLabel: { color: colors.muted, fontSize: 12 },
  performanceValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
});
