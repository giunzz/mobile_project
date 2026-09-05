import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';

interface StatusBadgeProps {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, styles[`${tone}Background`]]}>
      <View style={[styles.dot, styles[`${tone}Dot`]]} />
      <Text style={[styles.label, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dot: { borderRadius: 4, height: 7, marginRight: 6, width: 7 },
  label: { fontSize: 12, fontWeight: '800' },
  successBackground: { backgroundColor: colors.successSoft },
  warningBackground: { backgroundColor: colors.warningSoft },
  dangerBackground: { backgroundColor: colors.dangerSoft },
  infoBackground: { backgroundColor: colors.infoSoft },
  neutralBackground: { backgroundColor: '#EDF1F0' },
  successDot: { backgroundColor: colors.success },
  warningDot: { backgroundColor: colors.warning },
  dangerDot: { backgroundColor: colors.danger },
  infoDot: { backgroundColor: colors.info },
  neutralDot: { backgroundColor: colors.muted },
  successText: { color: colors.success },
  warningText: { color: colors.warning },
  dangerText: { color: colors.danger },
  infoText: { color: colors.info },
  neutralText: { color: colors.muted },
});
