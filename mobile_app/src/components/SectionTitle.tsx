import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

interface SectionTitleProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionTitle({
  title,
  actionLabel,
  onAction,
}: SectionTitleProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  action: { color: colors.primary, fontSize: 13, fontWeight: '800' },
});
