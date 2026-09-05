import {
  get,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from '@react-native-firebase/database';
import { initialSnapshot } from '../data/mockData';
import {
  DEMO_DEVICE_SIMULATOR_ENABLED,
  FEEDER_DEVICE_ID,
  getFeederDatabase,
} from '../firebase/config';
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
  SpeciesId,
  SpeciesProfile,
} from '../types/models';
import { FeederRepository } from './FeederRepository';

const delay = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

const speciesOrder: SpeciesId[] = [
  'cat',
  'dog',
  'rabbit',
  'hamster',
  'guinea_pig',
];

const withoutId = <T extends { id: string }>(value: T): Omit<T, 'id'> => {
  const result: Partial<T> = { ...value };
  delete result.id;
  return result as Omit<T, 'id'>;
};

const toFirebaseMap = <T extends { id: string }>(items: T[]) =>
  Object.fromEntries(items.map(item => [item.id, withoutId(item)]));

const fromFirebaseMap = <T extends { id: string }>(value: unknown): T[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item && typeof item === 'object')
    .map(
      ([id, item]) =>
        ({ ...(item as Omit<T, 'id'>), id }) as unknown as T,
    );
};

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error('Firebase operation failed.');

type SnapshotPart =
  | 'device'
  | 'detection'
  | 'profiles'
  | 'schedules'
  | 'history'
  | 'notifications'
  | 'commands';

type SnapshotParts = Partial<Record<SnapshotPart, unknown>>;

const sortNewestFirst = <T>(
  items: T[],
  getTimestamp: (item: T) => string,
) =>
  items.sort(
    (left, right) =>
      new Date(getTimestamp(right)).getTime() -
      new Date(getTimestamp(left)).getTime(),
  );

export class FirebaseFeederRepository implements FeederRepository {
  private initialization: Promise<void> | null = null;

  constructor(
    private readonly uid: string,
    private readonly email: string,
    private readonly name: string,
  ) {}

  private userPath(child: string) {
    return `users/${this.uid}/${child}`;
  }

  private devicePath(child: string) {
    return `devices/${FEEDER_DEVICE_ID}/${child}`;
  }

  private initialize() {
    if (!this.initialization) {
      this.initialization = this.bootstrapMissingData();
    }
    return this.initialization;
  }

  private async bootstrapMissingData() {
    const database = getFeederDatabase();
    const paths = {
      userProfile: this.userPath('profile'),
      profiles: this.userPath('species_profiles'),
      schedules: this.userPath('feeding_schedules'),
      notifications: this.userPath('notifications'),
      device: this.devicePath('status'),
      detection: this.devicePath('latest_detection'),
      history: this.devicePath('feeding_history'),
    };
    const entries = Object.entries(paths);
    const snapshots = await Promise.all(
      entries.map(([, path]) => get(ref(database, path))),
    );
    const exists = Object.fromEntries(
      entries.map(([key], index) => [key, snapshots[index].exists()]),
    );
    const updates: Record<string, unknown> = {};

    if (!exists.userProfile) {
      updates[paths.userProfile] = {
        email: this.email,
        name: this.name,
        deviceId: FEEDER_DEVICE_ID,
        createdAt: new Date().toISOString(),
      };
    }
    if (!exists.profiles) {
      updates[paths.profiles] = toFirebaseMap(initialSnapshot.profiles);
    }
    if (!exists.schedules) {
      updates[paths.schedules] = toFirebaseMap(initialSnapshot.schedules);
    }
    if (!exists.notifications) {
      updates[paths.notifications] = toFirebaseMap(
        initialSnapshot.notifications,
      );
    }
    if (!exists.device) {
      updates[paths.device] = withoutId(initialSnapshot.device);
    }
    if (!exists.detection) {
      updates[paths.detection] = initialSnapshot.detection;
    }
    if (!exists.history) {
      updates[paths.history] = toFirebaseMap(initialSnapshot.history);
    }

    if (Object.keys(updates).length) {
      await update(ref(database), updates);
    }
  }

  private buildSnapshot(parts: SnapshotParts): AppSnapshot {
    const profiles = fromFirebaseMap<SpeciesProfile>(parts.profiles).sort(
      (left, right) =>
        speciesOrder.indexOf(left.id) - speciesOrder.indexOf(right.id),
    );
    const schedules = fromFirebaseMap<FeedingSchedule>(parts.schedules);
    const history = sortNewestFirst(
      fromFirebaseMap<FeedingHistory>(parts.history),
      item => item.timestamp,
    );
    const notifications = sortNewestFirst(
      fromFirebaseMap<NotificationItem>(parts.notifications),
      item => item.timestamp,
    );
    const commands = sortNewestFirst(
      fromFirebaseMap<FeedingCommandRecord>(parts.commands),
      item => item.requestedAt,
    );

    return {
      device: {
        ...initialSnapshot.device,
        ...(parts.device as Partial<AppSnapshot['device']> | null),
        id: FEEDER_DEVICE_ID,
      },
      detection: {
        ...initialSnapshot.detection,
        ...(parts.detection as Partial<AppSnapshot['detection']> | null),
      },
      profiles,
      schedules,
      history,
      notifications,
      commands,
    };
  }

  private async readParts(): Promise<SnapshotParts> {
    const database = getFeederDatabase();
    const sources: Array<[SnapshotPart, string]> = [
      ['device', this.devicePath('status')],
      ['detection', this.devicePath('latest_detection')],
      ['profiles', this.userPath('species_profiles')],
      ['schedules', this.userPath('feeding_schedules')],
      ['history', this.devicePath('feeding_history')],
      ['notifications', this.userPath('notifications')],
      ['commands', this.devicePath('feeding_commands')],
    ];
    const snapshots = await Promise.all(
      sources.map(([, path]) => get(ref(database, path))),
    );
    return Object.fromEntries(
      sources.map(([key], index) => [key, snapshots[index].val()]),
    ) as SnapshotParts;
  }

  subscribe(
    onSnapshot: (snapshot: AppSnapshot) => void,
    onError?: (error: Error) => void,
  ) {
    let active = true;
    const unsubscribers: Array<() => void> = [];
    const parts: SnapshotParts = {};
    const received = new Set<SnapshotPart>();
    const database = getFeederDatabase();
    const sources: Array<[SnapshotPart, string]> = [
      ['device', this.devicePath('status')],
      ['detection', this.devicePath('latest_detection')],
      ['profiles', this.userPath('species_profiles')],
      ['schedules', this.userPath('feeding_schedules')],
      ['history', this.devicePath('feeding_history')],
      ['notifications', this.userPath('notifications')],
      ['commands', this.devicePath('feeding_commands')],
    ];

    this.initialize()
      .then(() => {
        if (!active) {
          return;
        }
        sources.forEach(([key, path]) => {
          const unsubscribe = onValue(
            ref(database, path),
            snapshot => {
              if (!active) {
                return;
              }
              parts[key] = snapshot.val();
              received.add(key);
              if (received.size === sources.length) {
                onSnapshot(this.buildSnapshot(parts));
              }
            },
            error => onError?.(asError(error)),
          );
          unsubscribers.push(unsubscribe);
        });
      })
      .catch(error => onError?.(asError(error)));

    return () => {
      active = false;
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }

  async getSnapshot() {
    await this.initialize();
    return this.buildSnapshot(await this.readParts());
  }

  async updateProfile(profile: SpeciesProfile) {
    await this.initialize();
    await set(
      ref(getFeederDatabase(), this.userPath(`species_profiles/${profile.id}`)),
      withoutId(profile),
    );
    return profile;
  }

  async addSchedule(schedule: FeedingSchedule) {
    await this.initialize();
    const target = push(
      ref(getFeederDatabase(), this.userPath('feeding_schedules')),
    );
    if (!target.key) {
      throw new Error('Firebase could not generate a schedule ID.');
    }
    const created = { ...schedule, id: target.key };
    await set(target, withoutId(created));
    return created;
  }

  async updateSchedule(schedule: FeedingSchedule) {
    await this.initialize();
    await set(
      ref(
        getFeederDatabase(),
        this.userPath(`feeding_schedules/${schedule.id}`),
      ),
      withoutId(schedule),
    );
    return schedule;
  }

  async toggleSchedule(id: string, enabled: boolean) {
    await this.initialize();
    await update(
      ref(
        getFeederDatabase(),
        this.userPath(`feeding_schedules/${id}`),
      ),
      { enabled },
    );
  }

  async deleteSchedule(id: string) {
    await this.initialize();
    await remove(
      ref(
        getFeederDatabase(),
        this.userPath(`feeding_schedules/${id}`),
      ),
    );
  }

  private getConsumedToday(snapshot: AppSnapshot, speciesId: SpeciesId) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return snapshot.history
      .filter(
        item =>
          item.speciesId === speciesId &&
          item.result === 'completed' &&
          new Date(item.timestamp).getTime() >= startOfToday.getTime(),
      )
      .reduce((sum, item) => sum + item.actualGrams, 0);
  }

  private async rejectCommand(
    command: FeedingCommandRecord,
    message: string,
    event: NotificationEvent,
  ): Promise<FeedCommandResult> {
    const database = getFeederDatabase();
    const completedAt = new Date().toISOString();
    const historyTarget = push(
      ref(database, this.devicePath('feeding_history')),
    );
    const notificationTarget = push(
      ref(database, this.userPath('notifications')),
    );
    if (!historyTarget.key || !notificationTarget.key) {
      throw new Error('Firebase could not generate result IDs.');
    }
    const finalCommand: FeedingCommandRecord = {
      ...command,
      status: 'rejected',
      completedAt,
      actualGrams: 0,
      errorMessage: message,
    };
    const history: FeedingHistory = {
      id: historyTarget.key,
      timestamp: completedAt,
      speciesId: command.speciesId,
      mode: 'manual',
      targetGrams: command.targetGrams,
      actualGrams: 0,
      result: 'cancelled',
    };
    const notification: NotificationItem = {
      id: notificationTarget.key,
      kind:
        event === 'device_offline' || event === 'feeding_failed'
          ? 'error'
          : 'warning',
      event,
      title: {
        device_offline: 'Device offline',
        daily_limit: 'Daily limit reached',
        unsupported_animal: 'Unsupported animal detected',
        feeding_failed: 'Feeding failed',
        feeding_completed: 'Feeding completed',
        device_reconnected: 'Device reconnected',
        food_low: 'Food level is getting low',
      }[event],
      message,
      timestamp: completedAt,
      read: false,
    };
    await update(ref(database), {
      [this.devicePath(`feeding_commands/${command.id}`)]: withoutId(
        finalCommand,
      ),
      [this.devicePath(`feeding_history/${history.id}`)]: withoutId(history),
      [this.userPath(`notifications/${notification.id}`)]: withoutId(
        notification,
      ),
    });
    return { command: finalCommand, history, notification };
  }

  private waitForHardwareCommand(commandId: string) {
    const database = getFeederDatabase();
    return new Promise<FeedingCommandRecord>((resolve, reject) => {
      let unsubscribe: () => void = () => undefined;
      const timer = setTimeout(() => {
        unsubscribe();
        reject(
          new Error(
            'The command is still pending. Check the ESP32 connection and Firebase command listener.',
          ),
        );
      }, 30000);
      unsubscribe = onValue(
        ref(database, this.devicePath(`feeding_commands/${commandId}`)),
        snapshot => {
          const value = snapshot.val() as Omit<FeedingCommandRecord, 'id'> | null;
          if (
            value &&
            ['completed', 'failed', 'rejected'].includes(value.status)
          ) {
            clearTimeout(timer);
            unsubscribe();
            resolve({ ...value, id: commandId });
          }
        },
        error => {
          clearTimeout(timer);
          unsubscribe();
          reject(asError(error));
        },
      );
    });
  }

  async feedNow(request: FeedCommand): Promise<FeedCommandResult> {
    await this.initialize();
    const database = getFeederDatabase();
    const commandTarget = push(
      ref(database, this.devicePath('feeding_commands')),
    );
    if (!commandTarget.key) {
      throw new Error('Firebase could not generate a command ID.');
    }
    const command: FeedingCommandRecord = {
      id: commandTarget.key,
      speciesId: request.speciesId,
      targetGrams: request.targetGrams,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    await set(commandTarget, withoutId(command));

    const snapshot = await this.getSnapshot();
    const profile = snapshot.profiles.find(item => item.id === request.speciesId);
    if (!snapshot.device.online) {
      return this.rejectCommand(
        command,
        'The command was blocked because the feeder is offline.',
        'device_offline',
      );
    }
    if (!profile) {
      return this.rejectCommand(
        command,
        'No feeding profile exists for the detected animal.',
        'unsupported_animal',
      );
    }
    const consumedToday = this.getConsumedToday(snapshot, request.speciesId);
    if (consumedToday + request.targetGrams > profile.dailyLimitGrams) {
      return this.rejectCommand(
        command,
        `${profile.displayName} has consumed ${consumedToday} g today. This request would exceed the ${profile.dailyLimitGrams} g daily limit.`,
        'daily_limit',
      );
    }

    if (!DEMO_DEVICE_SIMULATOR_ENABLED) {
      const finalCommand = await this.waitForHardwareCommand(command.id);
      const finalSnapshot = await this.getSnapshot();
      const history = finalSnapshot.history.find(
        item =>
          item.speciesId === command.speciesId &&
          item.timestamp >= command.requestedAt,
      );
      const notification = finalSnapshot.notifications.find(
        item => item.timestamp >= command.requestedAt,
      );
      if (!history || !notification) {
        throw new Error('The device finished but did not publish its result records.');
      }
      return { command: finalCommand, history, notification };
    }

    await delay(450);
    await update(commandTarget, { status: 'processing' });
    await delay(750);

    const completedAt = new Date().toISOString();
    const actualGrams = Math.max(
      0,
      request.targetGrams + Math.round(Math.random() * 4 - 2),
    );
    const finalCommand: FeedingCommandRecord = {
      ...command,
      status: 'completed',
      completedAt,
      actualGrams,
    };
    const historyTarget = push(
      ref(database, this.devicePath('feeding_history')),
    );
    const notificationTarget = push(
      ref(database, this.userPath('notifications')),
    );
    if (!historyTarget.key || !notificationTarget.key) {
      throw new Error('Firebase could not generate result IDs.');
    }
    const history: FeedingHistory = {
      id: historyTarget.key,
      timestamp: completedAt,
      speciesId: request.speciesId,
      mode: 'manual',
      targetGrams: request.targetGrams,
      actualGrams,
      result: 'completed',
    };
    const notification: NotificationItem = {
      id: notificationTarget.key,
      kind: 'success',
      event: 'feeding_completed',
      title: 'Manual feeding completed',
      message: `${actualGrams} g was dispensed for ${profile.displayName}.`,
      timestamp: completedAt,
      read: false,
    };
    await update(ref(database), {
      [this.devicePath(`feeding_commands/${command.id}`)]: withoutId(
        finalCommand,
      ),
      [this.devicePath(`feeding_history/${history.id}`)]: withoutId(history),
      [this.userPath(`notifications/${notification.id}`)]: withoutId(
        notification,
      ),
      [this.devicePath('status/foodLevelPercent')]: Math.max(
        0,
        snapshot.device.foodLevelPercent - 1,
      ),
      [this.devicePath('status/lastSync')]: completedAt,
    });
    return { command: finalCommand, history, notification };
  }

  async markAllNotificationsRead() {
    await this.initialize();
    const database = getFeederDatabase();
    const snapshot = await get(
      ref(database, this.userPath('notifications')),
    );
    const notifications = fromFirebaseMap<NotificationItem>(snapshot.val());
    if (!notifications.length) {
      return;
    }
    await update(
      ref(database),
      Object.fromEntries(
        notifications.map(item => [
          this.userPath(`notifications/${item.id}/read`),
          true,
        ]),
      ),
    );
  }

  async updateDeviceName(name: string) {
    await this.initialize();
    await update(
      ref(getFeederDatabase(), this.devicePath('status')),
      { name, lastSync: new Date().toISOString() },
    );
  }

  async updateOperatingMode(mode: FeedingMode) {
    await this.initialize();
    await update(
      ref(getFeederDatabase(), this.devicePath('status')),
      { operatingMode: mode, lastSync: new Date().toISOString() },
    );
  }
}
