import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow, spacing } from '../theme';

export type MainTab = 'dashboard' | 'profiles' | 'feed' | 'schedule' | 'more';

interface BottomNavigationProps {
  activeTab: MainTab;
  onSelect: (tab: MainTab) => void;
}

const tabs: { id: MainTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Home', icon: '⌂' },
  { id: 'profiles', label: 'Profiles', icon: '🐾' },
  { id: 'feed', label: 'Feed', icon: '●' },
  { id: 'schedule', label: 'Schedule', icon: '◷' },
  { id: 'more', label: 'More', icon: '•••' },
];

export function BottomNavigation({
  activeTab,
  onSelect,
}: BottomNavigationProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map(tab => {
        const active = activeTab === tab.id;
        const isFeed = tab.id === 'feed';
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.id}
            onPress={() => onSelect(tab.id)}
            style={styles.tab}
          >
            <View
              style={[
                styles.iconBox,
                active && styles.activeIconBox,
                isFeed && styles.feedIconBox,
              ]}
            >
              <Text
                style={[
                  styles.icon,
                  active && styles.activeIcon,
                  isFeed && styles.feedIcon,
                ]}
              >
                {tab.icon}
              </Text>
            </View>
            <Text style={[styles.label, active && styles.activeLabel]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
    ...shadow,
  },
  tab: { alignItems: 'center', flex: 1 },
  iconBox: {
    alignItems: 'center',
    borderRadius: 18,
    height: 34,
    justifyContent: 'center',
    minWidth: 42,
  },
  activeIconBox: { backgroundColor: colors.primarySoft },
  feedIconBox: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    height: 46,
    marginTop: -18,
    width: 46,
  },
  icon: { color: colors.muted, fontSize: 20, fontWeight: '800' },
  activeIcon: { color: colors.primaryDark },
  feedIcon: { color: '#FFF', fontSize: 23 },
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  activeLabel: { color: colors.primaryDark },
});
