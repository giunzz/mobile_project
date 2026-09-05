import React, { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radii, shadow, spacing } from '../theme';

interface CardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow,
  },
});
