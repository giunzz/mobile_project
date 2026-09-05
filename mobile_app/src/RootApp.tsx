import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BottomNavigation, MainTab } from './components/BottomNavigation';
import { PrimaryButton } from './components/PrimaryButton';
import { Screen } from './components/Screen';
import { useFeeder } from './context/FeederContext';
import { AppRoute } from './navigation';
import { DashboardScreen } from './screens/DashboardScreen';
import { DeviceSettingsScreen } from './screens/DeviceSettingsScreen';
import { FeedNowScreen } from './screens/FeedNowScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MoreScreen } from './screens/MoreScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { SpeciesSettingsScreen } from './screens/SpeciesSettingsScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { colors, spacing } from './theme';

const mainTabs: MainTab[] = [
  'dashboard',
  'profiles',
  'feed',
  'schedule',
  'more',
];

export function RootApp() {
  const { loading, currentUser, dataError, refresh, logout, snapshot } =
    useFeeder();
  const [route, setRoute] = useState<AppRoute>('dashboard');
  const [lastMainTab, setLastMainTab] = useState<MainTab>('dashboard');

  if (loading) {
    return (
      <Screen bottomInset={false} scroll={false} style={styles.loading}>
        <View style={styles.logoCircle}>
          <Text style={styles.logo}>🐾</Text>
        </View>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Connecting to smart feeder…</Text>
      </Screen>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  if (dataError && !snapshot) {
    return (
      <Screen bottomInset={false} scroll={false} style={styles.loading}>
        <Text style={styles.errorTitle}>Unable to load Firebase data</Text>
        <Text style={styles.errorText}>{dataError}</Text>
        <PrimaryButton label="Try again" onPress={refresh} style={styles.action} />
        <PrimaryButton
          label="Sign out"
          onPress={() => {
            logout().catch(() => undefined);
          }}
          style={styles.action}
          variant="secondary"
        />
      </Screen>
    );
  }

  const navigate = (nextRoute: AppRoute) => {
    if (mainTabs.includes(nextRoute as MainTab)) {
      setLastMainTab(nextRoute as MainTab);
    }
    setRoute(nextRoute);
  };
  const goBack = () => setRoute(lastMainTab);

  let content: React.ReactNode;
  switch (route) {
    case 'profiles':
      content = <SpeciesSettingsScreen />;
      break;
    case 'feed':
      content = <FeedNowScreen />;
      break;
    case 'schedule':
      content = <ScheduleScreen />;
      break;
    case 'more':
      content = <MoreScreen navigate={navigate} />;
      break;
    case 'history':
      content = <HistoryScreen goBack={goBack} navigate={navigate} />;
      break;
    case 'statistics':
      content = <StatisticsScreen goBack={goBack} navigate={navigate} />;
      break;
    case 'notifications':
      content = <NotificationsScreen goBack={goBack} navigate={navigate} />;
      break;
    case 'device':
      content = <DeviceSettingsScreen goBack={goBack} navigate={navigate} />;
      break;
    case 'dashboard':
    default:
      content = <DashboardScreen navigate={navigate} />;
      break;
  }

  const activeTab = mainTabs.includes(route as MainTab)
    ? (route as MainTab)
    : lastMainTab;

  return (
    <View style={styles.app}>
      {content}
      {mainTabs.includes(route as MainTab) ? (
        <BottomNavigation activeTab={activeTab} onSelect={navigate} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { backgroundColor: colors.background, flex: 1 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  logoCircle: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    marginBottom: spacing.xxl,
    width: 68,
  },
  logo: { fontSize: 34 },
  loadingText: { color: colors.muted, fontSize: 12, marginTop: spacing.md },
  errorTitle: {
    color: colors.danger,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  errorText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  action: { marginTop: spacing.lg, width: '100%' },
});
