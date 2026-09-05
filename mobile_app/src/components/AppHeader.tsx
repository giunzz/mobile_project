import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  actionLabel,
  onAction,
}: AppHeaderProps) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.xl,
    minHeight: 48,
  },
  copy: { flex: 1 },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  back: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 42,
  },
  backText: { color: colors.text, fontSize: 32, lineHeight: 34 },
  pressed: { opacity: 0.7 },
  action: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
});
