import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { colors, radii, spacing } from '../theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleProp<ViewStyle>;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' ? colors.primary : '#FFF'}
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'secondary' && styles.secondaryLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  danger: { backgroundColor: colors.danger },
  label: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  secondaryLabel: { color: colors.primaryDark },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
