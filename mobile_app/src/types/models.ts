export type SpeciesId = 'cat' | 'dog' | 'rabbit' | 'hamster' | 'guinea_pig';

export type FeedingMode = 'automatic' | 'manual';
export type FeedingResult = 'completed' | 'failed' | 'cancelled';
export type FeedingCommandStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rejected';
export type NotificationKind = 'success' | 'warning' | 'error' | 'device';
export type NotificationEvent =
  | 'feeding_completed'
  | 'feeding_failed'
  | 'device_offline'
  | 'device_reconnected'
  | 'food_low'
  | 'daily_limit'
  | 'unsupported_animal';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
}

export interface SpeciesProfile {
  id: SpeciesId;
  displayName: string;
  emoji: string;
  description: string;
  foodType: string;
  portionGrams: number;
  dailyLimitGrams: number;
  autoFeedEnabled: boolean;
  notificationsEnabled: boolean;
}

export interface FeedingSchedule {
  id: string;
  speciesId: SpeciesId;
  time: string;
  portionGrams: number;
  repeatLabel: string;
  enabled: boolean;
}

export interface FeedingHistory {
  id: string;
  timestamp: string;
  speciesId: SpeciesId;
  mode: FeedingMode;
  targetGrams: number;
  actualGrams: number;
  result: FeedingResult;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  event: NotificationEvent;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface DeviceStatus {
  id: string;
  name: string;
  online: boolean;
  foodLevelPercent: number;
  wifiStrengthPercent: number;
  lidClosed: boolean;
  firmwareVersion: string;
  ipAddress: string;
  lastSync: string;
  aiModelName: string;
  operatingMode: FeedingMode;
}

export interface DetectionStatus {
  speciesId: SpeciesId;
  confidence: number;
  capturedAt: string;
}

export interface AppSnapshot {
  device: DeviceStatus;
  detection: DetectionStatus;
  profiles: SpeciesProfile[];
  schedules: FeedingSchedule[];
  history: FeedingHistory[];
  notifications: NotificationItem[];
  commands: FeedingCommandRecord[];
}

export interface FeedCommand {
  speciesId: SpeciesId;
  targetGrams: number;
}

export interface FeedCommandResult {
  history: FeedingHistory;
  notification: NotificationItem;
  command: FeedingCommandRecord;
}

export interface FeedingCommandRecord {
  id: string;
  speciesId: SpeciesId;
  targetGrams: number;
  status: FeedingCommandStatus;
  requestedAt: string;
  completedAt?: string;
  actualGrams?: number;
  errorMessage?: string;
}
