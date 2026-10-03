import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useFeeder } from '../context/FeederContext';
import { NavigationProps } from '../navigation';
import { colors, radii, spacing } from '../theme';
import { FeedingMode } from '../types/models';
import { findProfile, formatDateTime } from '../utils/format';

type HistoryFilter = 'all' | FeedingMode;

export function HistoryScreen({ goBack }: NavigationProps) {
  const { snapshot } = useFeeder();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  if (!snapshot) {
    return null;
  }
  const rows = snapshot.history.filter(
    item => filter === 'all' || item.mode === filter,
  );

  return (
    <Screen>
      <AppHeader
        onBack={goBack}
        subtitle="Measured feeding history reported by firmware"
        title="Feeding history"
      />
      <View style={styles.filters}>
        {(['all', 'automatic', 'manual', 'unknown'] as HistoryFilter[]).map(
          item => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.filter, filter === item && styles.filterActive]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item && styles.filterTextActive,
                ]}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      {rows.map(item => {
        const profile = findProfile(snapshot.profiles, item.speciesId);
        return (
          <Card key={item.id} style={styles.rowCard}>
            <View style={styles.emojiBox}>
              <Text style={styles.emoji}>{profile?.emoji}</Text>
            </View>
            <View style={styles.copy}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{profile?.displayName}</Text>
                <StatusBadge
                  label={item.result}
                  tone={item.result === 'completed' ? 'success' : 'danger'}
                />
              </View>
              <Text style={styles.meta}>{formatDateTime(item.timestamp)}</Text>
              <View style={styles.details}>
                <Text style={styles.detail}>Mode: {item.mode}</Text>
                <Text style={styles.detail}>Target: {item.targetGrams} g</Text>
                <Text style={styles.actual}>Actual: {item.actualGrams} g</Text>
              </View>
            </View>
          </Card>
        );
      })}
      {!rows.length ? (
        <Text style={styles.empty}>No feeding records match this filter.</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  filter: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#FFF' },
  rowCard: { flexDirection: 'row', marginBottom: spacing.md },
  emojiBox: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    height: 50,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 50,
  },
  emoji: { fontSize: 28 },
  copy: { flex: 1 },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  detail: { color: colors.muted, fontSize: 10 },
  actual: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  empty: { color: colors.muted, marginTop: spacing.xxxl, textAlign: 'center' },
});
