import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useFeeder } from '../context/FeederContext';
import { colors, radii, spacing } from '../theme';

export function LoginScreen() {
  const { login, register } = useFeeder();
  const [email, setEmail] = useState('demo@smartfeeder.app');
  const [password, setPassword] = useState('123456');
  const [secure, setSecure] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : 'Unable to sign in.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    setSubmitting(true);
    try {
      await register(email, password);
    } catch (registerError) {
      setError(
        registerError instanceof Error
          ? registerError.message
          : 'Unable to create the Firebase account.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen bottomInset={false} style={styles.screen}>
      <View style={styles.brand}>
        <View style={styles.logoCircle}>
          <Text style={styles.logo}>🐾</Text>
        </View>
        <Text style={styles.title}>AI Smart Pet Feeder</Text>
        <Text style={styles.subtitle}>
          Species-aware feeding, right from your phone.
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.formTitle}>Welcome back</Text>
        <Text style={styles.formHint}>
          Sign in to manage your smart feeder.
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="name@example.com"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            autoCapitalize="none"
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry={secure}
            style={styles.passwordInput}
            value={password}
          />
          <Pressable onPress={() => setSecure(current => !current)}>
            <Text style={styles.show}>{secure ? 'Show' : 'Hide'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          label="Sign in"
          loading={submitting}
          onPress={handleLogin}
          style={styles.button}
        />
        <PrimaryButton
          disabled={submitting}
          label="Create Firebase account"
          onPress={handleRegister}
          style={styles.registerButton}
          variant="secondary"
        />
        <Text style={styles.demo}>
          Firebase Authentication is active. New accounts automatically receive
          starter feeder data in Realtime Database.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', paddingBottom: spacing.xxl },
  brand: { alignItems: 'center', marginBottom: spacing.xxxl },
  logoCircle: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: 72,
  },
  logo: { fontSize: 36 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900' },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  form: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  formTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  formHint: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: spacing.xl,
    marginTop: 4,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    height: 52,
    paddingHorizontal: spacing.lg,
  },
  passwordRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    height: 52,
    paddingHorizontal: spacing.lg,
  },
  passwordInput: { color: colors.text, flex: 1, fontSize: 15 },
  show: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.md },
  button: { marginTop: spacing.xl },
  registerButton: { marginTop: spacing.md },
  demo: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
