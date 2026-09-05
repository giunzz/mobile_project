import { Platform } from 'react-native';

export const colors = {
  background: '#F3F7F5',
  surface: '#FFFFFF',
  primary: '#16735F',
  primaryDark: '#0E5546',
  primarySoft: '#DDF1EC',
  accent: '#F4A63A',
  accentSoft: '#FFF1D9',
  text: '#17372F',
  muted: '#6A7E78',
  border: '#DCE7E3',
  success: '#2F9868',
  successSoft: '#E1F5EA',
  warning: '#D88A24',
  warningSoft: '#FFF2DE',
  danger: '#D95555',
  dangerSoft: '#FDE8E8',
  info: '#3B78C2',
  infoSoft: '#E6F0FC',
  overlay: 'rgba(12, 44, 36, 0.45)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
};

export const shadow = Platform.select({
  ios: {
    shadowColor: '#0B3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  android: { elevation: 2 },
  default: {},
});
