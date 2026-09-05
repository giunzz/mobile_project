import {
  AppSnapshot,
  FeedCommand,
  FeedCommandResult,
  FeedingMode,
  FeedingSchedule,
  SpeciesProfile,
} from '../types/models';

export interface FeederRepository {
  subscribe(
    onSnapshot: (snapshot: AppSnapshot) => void,
    onError?: (error: Error) => void,
  ): () => void;
  getSnapshot(): Promise<AppSnapshot>;
  updateProfile(profile: SpeciesProfile): Promise<SpeciesProfile>;
  addSchedule(schedule: FeedingSchedule): Promise<FeedingSchedule>;
  updateSchedule(schedule: FeedingSchedule): Promise<FeedingSchedule>;
  toggleSchedule(id: string, enabled: boolean): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
  feedNow(command: FeedCommand): Promise<FeedCommandResult>;
  markAllNotificationsRead(): Promise<void>;
  updateDeviceName(name: string): Promise<void>;
  updateOperatingMode(mode: FeedingMode): Promise<void>;
}
