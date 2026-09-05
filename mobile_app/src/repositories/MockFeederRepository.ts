import { initialSnapshot } from '../data/mockData';
import {
  AppSnapshot,
  FeedCommand,
  FeedCommandResult,
  FeedingCommandRecord,
  FeedingHistory,
  FeedingMode,
  FeedingSchedule,
  NotificationEvent,
  NotificationItem,
  SpeciesProfile,
} from '../types/models';
import { FeederRepository } from './FeederRepository';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const delay = (milliseconds = 220) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

type SnapshotListener = (snapshot: AppSnapshot) => void;

export class MockFeederRepository implements FeederRepository {
  private snapshot: AppSnapshot = clone(initialSnapshot);
  private listeners = new Set<SnapshotListener>();

  subscribe(onSnapshot: SnapshotListener, _onError?: (error: Error) => void) {
    this.listeners.add(onSnapshot);
    onSnapshot(clone(this.snapshot));
    return () => this.listeners.delete(onSnapshot);
  }

  private emit() {
    const nextSnapshot = clone(this.snapshot);
    this.listeners.forEach(listener => listener(nextSnapshot));
  }

  async getSnapshot() {
    await delay(120);
    return clone(this.snapshot);
  }

  async updateProfile(profile: SpeciesProfile) {
    await delay();
    this.snapshot.profiles = this.snapshot.profiles.map(item =>
      item.id === profile.id ? clone(profile) : item,
    );
    this.emit();
    return clone(profile);
  }

  async addSchedule(schedule: FeedingSchedule) {
    await delay();
    const created = { ...schedule, id: `schedule-${Date.now()}` };
    this.snapshot.schedules.push(created);
    this.emit();
    return clone(created);
  }

  async updateSchedule(schedule: FeedingSchedule) {
    await delay();
    this.snapshot.schedules = this.snapshot.schedules.map(item =>
      item.id === schedule.id ? clone(schedule) : item,
    );
    this.emit();
    return clone(schedule);
  }

  async toggleSchedule(id: string, enabled: boolean) {
    await delay(120);
    this.snapshot.schedules = this.snapshot.schedules.map(item =>
      item.id === id ? { ...item, enabled } : item,
    );
    this.emit();
  }

  async deleteSchedule(id: string) {
    await delay(120);
    this.snapshot.schedules = this.snapshot.schedules.filter(
      item => item.id !== id,
    );
    this.emit();
  }

  private getTodayConsumedGrams(speciesId: FeedCommand['speciesId']) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return this.snapshot.history
      .filter(
        item =>
          item.speciesId === speciesId &&
          item.result === 'completed' &&
          new Date(item.timestamp).getTime() >= startOfToday.getTime(),
      )
      .reduce((sum, item) => sum + item.actualGrams, 0);
  }

  private finishRejectedCommand(
    command: FeedingCommandRecord,
    message: string,
    event: NotificationEvent,
  ): FeedCommandResult {
    const completedAt = new Date().toISOString();
    const finalCommand: FeedingCommandRecord = {
      ...command,
      status: 'rejected',
      completedAt,
      actualGrams: 0,
      errorMessage: message,
    };
    const history: FeedingHistory = {
      id: `history-${Date.now()}`,
      timestamp: completedAt,
      speciesId: command.speciesId,
      mode: 'manual',
      targetGrams: command.targetGrams,
      actualGrams: 0,
      result: 'cancelled',
    };
    const notification: NotificationItem = {
      id: `notification-${Date.now()}`,
      kind: event === 'device_offline' ? 'error' : 'warning',
      event,
      title:
        event === 'device_offline' ? 'Device offline' : 'Daily limit reached',
      message,
      timestamp: completedAt,
      read: false,
    };

    this.snapshot.commands = this.snapshot.commands.map(item =>
      item.id === command.id ? finalCommand : item,
    );
    this.snapshot.history.unshift(history);
    this.snapshot.notifications.unshift(notification);
    this.emit();
    return clone({ command: finalCommand, history, notification });
  }

  async feedNow(command: FeedCommand): Promise<FeedCommandResult> {
    const requestedAt = new Date().toISOString();
    const commandRecord: FeedingCommandRecord = {
      id: `command-${Date.now()}`,
      speciesId: command.speciesId,
      targetGrams: command.targetGrams,
      status: 'pending',
      requestedAt,
    };
    this.snapshot.commands.unshift(commandRecord);
    this.emit();
    await delay(320);

    const profile = this.snapshot.profiles.find(
      item => item.id === command.speciesId,
    );
    if (!this.snapshot.device.online) {
      return this.finishRejectedCommand(
        commandRecord,
        'The command was blocked because the feeder is offline.',
        'device_offline',
      );
    }
    if (!profile) {
      return this.finishRejectedCommand(
        commandRecord,
        'No feeding profile exists for the detected animal.',
        'unsupported_animal',
      );
    }

    const consumedToday = this.getTodayConsumedGrams(command.speciesId);
    if (consumedToday + command.targetGrams > profile.dailyLimitGrams) {
      return this.finishRejectedCommand(
        commandRecord,
        `${profile.displayName} has consumed ${consumedToday} g today. This request would exceed the ${profile.dailyLimitGrams} g daily limit.`,
        'daily_limit',
      );
    }

    this.snapshot.commands = this.snapshot.commands.map(item =>
      item.id === commandRecord.id ? { ...item, status: 'processing' } : item,
    );
    this.emit();
    await delay(650);

    const completedAt = new Date().toISOString();
    const actualGrams = Math.max(
      0,
      command.targetGrams + Math.round(Math.random() * 4 - 2),
    );
    const finalCommand: FeedingCommandRecord = {
      ...commandRecord,
      status: 'completed',
      completedAt,
      actualGrams,
    };
    const history: FeedingHistory = {
      id: `history-${Date.now()}`,
      timestamp: completedAt,
      speciesId: command.speciesId,
      mode: 'manual',
      targetGrams: command.targetGrams,
      actualGrams,
      result: 'completed',
    };
    const notification: NotificationItem = {
      id: `notification-${Date.now()}`,
      kind: 'success',
      event: 'feeding_completed',
      title: 'Manual feeding completed',
      message: `${actualGrams} g was dispensed for ${profile.displayName}.`,
      timestamp: completedAt,
      read: false,
    };

    this.snapshot.commands = this.snapshot.commands.map(item =>
      item.id === commandRecord.id ? finalCommand : item,
    );
    this.snapshot.history.unshift(history);
    this.snapshot.notifications.unshift(notification);
    this.snapshot.device.foodLevelPercent = Math.max(
      0,
      this.snapshot.device.foodLevelPercent - 1,
    );
    this.snapshot.device.lastSync = completedAt;
    this.emit();
    return clone({ command: finalCommand, history, notification });
  }

  async markAllNotificationsRead() {
    await delay(100);
    this.snapshot.notifications = this.snapshot.notifications.map(item => ({
      ...item,
      read: true,
    }));
    this.emit();
  }

  async updateDeviceName(name: string) {
    await delay(180);
    this.snapshot.device.name = name;
    this.emit();
  }

  async updateOperatingMode(mode: FeedingMode) {
    await delay(180);
    this.snapshot.device.operatingMode = mode;
    this.emit();
  }
}
