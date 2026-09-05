import { MainTab } from './components/BottomNavigation';

export type AppRoute =
  | MainTab
  | 'history'
  | 'statistics'
  | 'notifications'
  | 'device';

export interface NavigationProps {
  navigate: (route: AppRoute) => void;
  goBack?: () => void;
}
