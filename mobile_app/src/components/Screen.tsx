import React, { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  bottomInset?: boolean;
}

export function Screen({
  children,
  scroll = true,
  style,
  bottomInset = true,
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        bottomInset && styles.bottomInset,
        style,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, style]}>{children}</View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  fill: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  bottomInset: { paddingBottom: 112 },
});
